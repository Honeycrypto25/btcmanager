import "server-only";
import { db } from "@/lib/db";
import { loadBotKeypair } from "./wallet";
import { runSolanaSweepForUser } from "./sweep";
import {
    createTriggerSellOrder,
    executeSwap,
    getActiveTriggerOrders,
    getHistoricalTriggerOrder,
    getSolPriceUsd,
    getSwapQuote,
} from "./jupiter";
import { MIN_TRIGGER_ORDER_USD, SOL_DECIMALS, SOL_MINT, USDC_DECIMALS, USDC_MINT } from "./constants";

function toRawAmount(amount: number, decimals: number): string {
    return Math.round(amount * 10 ** decimals).toString();
}

function fromRawAmount(raw: string, decimals: number): number {
    return Number(raw) / 10 ** decimals;
}

export interface DcaRunResult {
    userId: string;
    action: "skipped" | "bought" | "error";
    reason?: string;
    lotId?: string;
}

/**
 * Reconciles ALL of this user's OPEN lots against Jupiter's Trigger API in
 * one batched pass: a single (paginated) call fetches every currently-
 * active order for the wallet, so lots still genuinely open cost nothing
 * beyond that one fetch. Only lots whose order has DROPPED OUT of the
 * active list (i.e. actually filled or got cancelled) get an individual,
 * targeted history lookup for their fill details — that's normally 0-1
 * lots per run, not the full set. Every OPEN lot gets `lastCheckedAt`
 * stamped regardless, so the UI can show "still being watched" even when
 * nothing changed. Runs once per cycle, right before deciding whether a
 * new buy is due.
 */
interface ReconcileResult {
    checked: number;
    filled: number;
    cancelled: number;
}

async function reconcileOpenLots(userId: string, walletAddress: string): Promise<ReconcileResult> {
    const openLots = await db.solanaLot.findMany({ where: { userId, status: "OPEN" } });
    const result: ReconcileResult = { checked: openLots.length, filled: 0, cancelled: 0 };
    if (openLots.length === 0) return result;

    const activeOrders = await getActiveTriggerOrders(walletAddress);
    const now = new Date();

    for (const lot of openLots) {
        if (!lot.jupiterOrderKey) continue;

        if (activeOrders.has(lot.jupiterOrderKey)) {
            // Still open on Jupiter's side — nothing to update except the checked timestamp.
            await db.solanaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        // No longer active — it must have filled or been cancelled. Only now
        // is an individual (more expensive) history lookup worth doing.
        const order = await getHistoricalTriggerOrder(walletAddress, lot.jupiterOrderKey);
        if (!order) {
            // Not found anywhere yet (e.g. propagation delay right after creation) — just mark checked, try again next run.
            await db.solanaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        if (order.status === "Completed") {
            const fill = order.trades[0];
            // NB: fill.inputAmount/outputAmount (and order.makingAmount/takingAmount)
            // are already decimal-adjusted despite reading like raw amounts — the
            // *actual* raw atomic-unit fields are raw{Input,Output}Amount /
            // raw{Making,Taking}Amount. Must use those with fromRawAmount().
            const solSold = fill ? fromRawAmount(fill.rawInputAmount, SOL_DECIMALS) : fromRawAmount(order.rawMakingAmount, SOL_DECIMALS);
            const proceedsUsd = fill ? fromRawAmount(fill.rawOutputAmount, USDC_DECIMALS) : fromRawAmount(order.rawTakingAmount, USDC_DECIMALS);
            // Fee is charged in the output token (USDC) when Jupiter takes one; 0 for plain trigger orders without a referral fee.
            const feeUsd = fill && fill.feeMint === USDC_MINT ? fromRawAmount(fill.rawFeeAmount, USDC_DECIMALS) : 0;

            const costBasisUsd = Number(lot.buyPriceUsd) * solSold;
            // The buy-side network fee applies to the WHOLE lot, not just
            // the slice being sold here — allocate it proportionally so a
            // lot that's only partially sold doesn't have the full buy fee
            // charged against just this sale. This is what "net P&L" is
            // supposed to mean per the schema comment on realizedPnlUsd.
            const solAcquiredNum = Number(lot.solAcquired);
            const buyFeeShare = solAcquiredNum > 0 ? Number(lot.buyFeeUsd) * (solSold / solAcquiredNum) : 0;
            const realizedPnlUsd = proceedsUsd - feeUsd - costBasisUsd - buyFeeShare;

            await db.solanaLot.update({
                where: { id: lot.id },
                data: {
                    status: "FILLED",
                    soldAt: fill ? new Date(fill.confirmedAt) : now,
                    solSold,
                    sellProceedsUsd: proceedsUsd,
                    sellFeeUsd: feeUsd,
                    sellTxSignature: fill?.txId,
                    realizedPnlUsd,
                    solRemaining: Number(lot.solAcquired) - solSold,
                    lastCheckedAt: now,
                },
            });
            result.filled++;
        } else if (order.status === "Cancelled") {
            await db.solanaLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", solRemaining: lot.solAcquired, lastCheckedAt: now },
            });
            result.cancelled++;
        } else {
            await db.solanaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
        }
    }

    return result;
}

/**
 * Manual "check now" — reconciles this user's open sell orders against
 * Jupiter without touching the buy side (no new purchase, no interval
 * check). Lets the user confirm on demand that an order actually landed
 * or filled, instead of waiting for the next scheduled cron pass.
 */
export async function reconcileSolanaOrdersForUser(userId: string): Promise<ReconcileResult> {
    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings) return { checked: 0, filled: 0, cancelled: 0 };
    return reconcileOpenLots(userId, settings.walletAddress);
}

/**
 * Runs one DCA cycle for a single user: reconciles previously-open sell
 * orders, then — if `intervalHours` have elapsed since the last buy — buys
 * `buyAmountUsd` of SOL and places a take-profit trigger sell order for
 * `sellAmountUsd` of it at `+takeProfitPercent`. Safe to call more often
 * than the configured interval; it no-ops until it's actually due.
 */
export async function runSolanaDcaForUser(userId: string): Promise<DcaRunResult> {
    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings || !settings.enabled) return { userId, action: "skipped", reason: "disabled" };

    try {
        await reconcileOpenLots(userId, settings.walletAddress);

        const dueAt = settings.lastRunAt
            ? new Date(settings.lastRunAt.getTime() + settings.intervalHours * 60 * 60 * 1000)
            : null;
        if (dueAt && dueAt.getTime() > Date.now()) {
            return { userId, action: "skipped", reason: `next buy due at ${dueAt.toISOString()}` };
        }

        const sellAmountUsd = Number(settings.sellAmountUsd);
        if (sellAmountUsd < MIN_TRIGGER_ORDER_USD) {
            throw new Error(`sellAmountUsd must be at least $${MIN_TRIGGER_ORDER_USD} (Jupiter Trigger API minimum)`);
        }

        const keypair = loadBotKeypair();
        if (keypair.publicKey.toBase58() !== settings.walletAddress) {
            throw new Error("SOLANA_PRIVATE_KEY does not match the wallet address configured in settings — refusing to trade.");
        }

        // 1) Buy: USDC -> SOL
        const buyAmountUsd = Number(settings.buyAmountUsd);
        const quote = await getSwapQuote({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            amount: toRawAmount(buyAmountUsd, USDC_DECIMALS),
            slippageBps: settings.slippageBps,
        });
        const { signature: buyTxSignature, feeLamports } = await executeSwap(quote, keypair);

        const solAcquired = fromRawAmount(quote.outAmount, SOL_DECIMALS);
        const buyPriceUsd = buyAmountUsd / solAcquired;
        // Network fee is paid in SOL — convert to USD at the price we just bought at (close enough; it's a few thousand lamports, well under a cent either way).
        const buyFeeUsd = (feeLamports / 10 ** SOL_DECIMALS) * buyPriceUsd;

        const lot = await db.solanaLot.create({
            data: {
                userId,
                status: "PENDING_SELL_ORDER",
                buyAmountUsd,
                solAcquired,
                buyPriceUsd,
                buyFeeUsd,
                buyTxSignature,
                solRemaining: solAcquired,
            },
        });

        // 2) Place the take-profit sell order for the configured USD slice of this lot.
        try {
            const targetPriceUsd = buyPriceUsd * (1 + Number(settings.takeProfitPercent) / 100);
            const sellAmountSol = sellAmountUsd / targetPriceUsd;

            const { orderKey, txSignature } = await createTriggerSellOrder({
                keypair,
                inputMint: SOL_MINT,
                outputMint: USDC_MINT,
                makingAmountRaw: toRawAmount(sellAmountSol, SOL_DECIMALS),
                takingAmountRaw: toRawAmount(sellAmountUsd, USDC_DECIMALS),
            });

            await db.solanaLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    sellAmountSolPlanned: sellAmountSol,
                    jupiterOrderKey: orderKey,
                    sellOrderCreatedAt: new Date(),
                    sellOrderTxSignature: txSignature,
                },
            });
        } catch (sellErr) {
            // Buy already succeeded and is on-chain — don't lose that. Leave the
            // lot as PENDING_SELL_ORDER so the next cron run (or a manual retry)
            // can attempt to place the sell order again.
            const message = sellErr instanceof Error ? sellErr.message : String(sellErr);
            await db.solanaLot.update({
                where: { id: lot.id },
                data: { notes: `Sell order creation failed: ${message}` },
            });
        }

        await db.solanaSettings.update({
            where: { userId },
            data: { lastRunAt: new Date(), lastRunStatus: "ok", lastRunError: null },
        });

        return { userId, action: "bought", lotId: lot.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.solanaSettings.update({
            where: { userId },
            data: { lastRunStatus: "error", lastRunError: message },
        });
        return { userId, action: "error", reason: message };
    }
}

/** Entry point for the cron endpoint — runs every enabled user's cycle. */
export async function runSolanaDcaForAllUsers(): Promise<DcaRunResult[]> {
    // Sweep has its own independent toggle (sweepEnabled) — a user could
    // want auto-sweep running even with DCA buying paused, or vice versa —
    // so this pulls in anyone opted into either, and only calls each
    // routine when its own flag is on.
    const settingsRows = await db.solanaSettings.findMany({
        where: { OR: [{ enabled: true }, { sweepEnabled: true }] },
    });
    const results: DcaRunResult[] = [];
    for (const s of settingsRows) {
        if (s.enabled) {
            results.push(await runSolanaDcaForUser(s.userId));
        }
        if (s.sweepEnabled) {
            try {
                await runSolanaSweepForUser(s.userId);
            } catch (err) {
                console.error(`Solana sweep failed for user ${s.userId}`, err);
            }
        }
    }
    return results;
}

/** Current SOL price + a quick portfolio-level snapshot, for the settings page. */
export async function getSolanaQuickStats(userId: string) {
    const [settings, lots, price] = await Promise.all([
        db.solanaSettings.findUnique({ where: { userId } }),
        db.solanaLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } }),
        getSolPriceUsd().catch(() => null),
    ]);
    return { settings, lots, solPriceUsd: price };
}
