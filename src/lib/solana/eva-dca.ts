import "server-only";
import type { Keypair } from "@solana/web3.js";
import { db } from "@/lib/db";
import { loadBotKeypair } from "./wallet";
import { runEvaSweepForUser } from "./eva-sweep";
import {
    createTriggerSellOrder,
    executeUltraOrder,
    getActiveTriggerOrders,
    getHistoricalTriggerOrder,
    getTokenPriceUsd,
    getUltraOrder,
} from "./jupiter";
import { EVA_DECIMALS, EVA_MINT, MIN_TRIGGER_ORDER_USD, SOL_DECIMALS, SOL_MINT, USDC_DECIMALS, USDC_MINT } from "./constants";
import { notifyOrderPlaced, notifyOrderFilled } from "@/lib/email/tx-notify";

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
 * new buy is due. Mirrors dca.ts's reconcileOpenLots, operating on
 * db.evaLot / EVA_MINT instead of SOL.
 */
interface ReconcileResult {
    checked: number;
    filled: number;
    cancelled: number;
}

async function reconcileOpenLots(userId: string, walletAddress: string): Promise<ReconcileResult> {
    const openLots = await db.evaLot.findMany({ where: { userId, status: "OPEN" } });
    const result: ReconcileResult = { checked: openLots.length, filled: 0, cancelled: 0 };
    if (openLots.length === 0) return result;

    const activeOrders = await getActiveTriggerOrders(walletAddress);
    const now = new Date();

    for (const lot of openLots) {
        if (!lot.jupiterOrderKey) continue;

        if (activeOrders.has(lot.jupiterOrderKey)) {
            // Still open on Jupiter's side — nothing to update except the checked timestamp.
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        // No longer active — it must have filled or been cancelled. Only now
        // is an individual (more expensive) history lookup worth doing.
        const order = await getHistoricalTriggerOrder(walletAddress, lot.jupiterOrderKey);
        if (!order) {
            // Not found anywhere yet (e.g. propagation delay right after creation) — just mark checked, try again next run.
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        if (order.status === "Completed") {
            const fill = order.trades[0];
            // NB: fill.inputAmount/outputAmount (and order.makingAmount/takingAmount)
            // are already decimal-adjusted despite reading like raw amounts — the
            // *actual* raw atomic-unit fields are raw{Input,Output}Amount /
            // raw{Making,Taking}Amount. Must use those with fromRawAmount().
            const evaSold = fill ? fromRawAmount(fill.rawInputAmount, EVA_DECIMALS) : fromRawAmount(order.rawMakingAmount, EVA_DECIMALS);
            const proceedsUsd = fill ? fromRawAmount(fill.rawOutputAmount, USDC_DECIMALS) : fromRawAmount(order.rawTakingAmount, USDC_DECIMALS);
            // Fee is charged in the output token (USDC) when Jupiter takes one; 0 for plain trigger orders without a referral fee.
            const feeUsd = fill && fill.feeMint === USDC_MINT ? fromRawAmount(fill.rawFeeAmount, USDC_DECIMALS) : 0;

            const costBasisUsd = Number(lot.buyPriceUsd) * evaSold;
            // The buy-side network fee applies to the WHOLE lot, not just
            // the slice being sold here — allocate it proportionally so a
            // lot that's only partially sold doesn't have the full buy fee
            // charged against just this sale. This is what "net P&L" is
            // supposed to mean per the schema comment on realizedPnlUsd.
            const evaAcquiredNum = Number(lot.evaAcquired);
            const buyFeeShare = evaAcquiredNum > 0 ? Number(lot.buyFeeUsd) * (evaSold / evaAcquiredNum) : 0;
            const realizedPnlUsd = proceedsUsd - feeUsd - costBasisUsd - buyFeeShare;

            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "FILLED",
                    soldAt: fill ? new Date(fill.confirmedAt) : now,
                    evaSold,
                    sellProceedsUsd: proceedsUsd,
                    sellFeeUsd: feeUsd,
                    sellTxSignature: fill?.txId,
                    realizedPnlUsd,
                    evaRemaining: Number(lot.evaAcquired) - evaSold,
                    lastCheckedAt: now,
                },
            });
            result.filled++;
            await notifyOrderFilled({
                chain: "Solana",
                tokenSymbol: "Eva",
                tokenSold: evaSold,
                sellProceedsUsd: proceedsUsd,
                realizedPnlUsd,
                sellFeeUsd: feeUsd,
                sellTxUrl: fill?.txId ? `https://solscan.io/tx/${fill.txId}` : undefined,
            });
        } else if (order.status === "Cancelled") {
            await db.evaLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", evaRemaining: lot.evaAcquired, lastCheckedAt: now },
            });
            result.cancelled++;
        } else {
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
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
export async function reconcileEvaOrdersForUser(userId: string): Promise<ReconcileResult> {
    const settings = await db.evaSettings.findUnique({ where: { userId } });
    if (!settings) return { checked: 0, filled: 0, cancelled: 0 };
    return reconcileOpenLots(userId, settings.walletAddress);
}

/**
 * Retries placing the take-profit sell order for any lot stuck in
 * PENDING_SELL_ORDER — i.e. the buy went through on-chain but something
 * (an RPC hiccup, a Jupiter API error, a crash) prevented the sell order
 * from being created right after. Without this, such a lot would sit there
 * forever: nothing else in the app ever revisits PENDING_SELL_ORDER, since
 * reconcileOpenLots only looks at status OPEN. Runs on every cron pass,
 * before the interval-gated buy check, so a stuck lot gets fixed even on a
 * day the interval isn't due for a fresh buy. Mirrors the SOL/BNB/EVM side.
 */
async function retryPendingSellOrders(
    userId: string,
    settings: { takeProfitPercent: unknown; sellAmountUsd: unknown },
    keypair: Keypair,
): Promise<void> {
    const stuckLots = await db.evaLot.findMany({ where: { userId, status: "PENDING_SELL_ORDER" } });
    for (const lot of stuckLots) {
        try {
            const targetPriceUsd = Number(lot.buyPriceUsd) * (1 + Number(settings.takeProfitPercent) / 100);
            const sellAmountUsd = Number(settings.sellAmountUsd);
            const sellAmountEva = sellAmountUsd / targetPriceUsd;

            const { orderKey, txSignature } = await createTriggerSellOrder({
                keypair,
                inputMint: EVA_MINT,
                outputMint: USDC_MINT,
                makingAmountRaw: toRawAmount(sellAmountEva, EVA_DECIMALS),
                takingAmountRaw: toRawAmount(sellAmountUsd, USDC_DECIMALS),
            });

            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    sellAmountEvaPlanned: sellAmountEva,
                    jupiterOrderKey: orderKey,
                    sellOrderCreatedAt: new Date(),
                    sellOrderTxSignature: txSignature,
                    notes: null,
                },
            });

            await notifyOrderPlaced({
                chain: "Solana",
                tokenSymbol: "Eva",
                buyAmountUsd: Number(lot.buyAmountUsd),
                tokenAcquired: Number(lot.evaAcquired),
                buyPriceUsd: Number(lot.buyPriceUsd),
                targetPriceUsd,
                takeProfitPercent: Number(settings.takeProfitPercent),
                sellAmountPlanned: sellAmountEva,
                buyTxUrl: lot.buyTxSignature ? `https://solscan.io/tx/${lot.buyTxSignature}` : undefined,
            });
        } catch (err) {
            // Still stuck — leave it for the next cron pass to retry again.
            const message = err instanceof Error ? err.message : String(err);
            await db.evaLot.update({
                where: { id: lot.id },
                data: { notes: `Sell order retry failed: ${message}` },
            });
        }
    }
}

/**
 * Runs one DCA cycle for a single user: reconciles previously-open sell
 * orders, then — if `intervalHours` have elapsed since the last buy — buys
 * `buyAmountUsd` of EVA and places a take-profit trigger sell order for
 * `sellAmountUsd` of it at `+takeProfitPercent`. Safe to call more often
 * than the configured interval; it no-ops until it's actually due. Mirrors
 * dca.ts's runSolanaDcaForUser — same bot wallet (SOLANA_PRIVATE_KEY),
 * different mint (EVA_MINT) and much wider default slippage (see
 * EvaSettings.slippageBps comment in the schema).
 */
export async function runEvaDcaForUser(userId: string): Promise<DcaRunResult> {
    const settings = await db.evaSettings.findUnique({ where: { userId } });
    if (!settings || !settings.enabled) return { userId, action: "skipped", reason: "disabled" };

    try {
        await reconcileOpenLots(userId, settings.walletAddress);

        // Keypair is needed both for retrying any stuck sell order and for
        // a fresh buy, so load it up front — independent of whether a new
        // buy is due today. Same env var as the SOL module — this bot
        // reuses that wallet, it does not have its own key.
        const keypair = loadBotKeypair();
        if (keypair.publicKey.toBase58() !== settings.walletAddress) {
            throw new Error("SOLANA_PRIVATE_KEY does not match the wallet address configured in settings — refusing to trade.");
        }

        // A lot can be stuck in PENDING_SELL_ORDER if a previous run's buy
        // succeeded on-chain but placing the sell order afterwards failed
        // (RPC hiccup, Jupiter API error, etc.). Retry those every pass,
        // regardless of whether a new buy is due.
        await retryPendingSellOrders(userId, settings, keypair);

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

        // 1) Buy: USDC -> EVA. Uses Jupiter's Ultra order/execute API, not
        // the classic Swap API the SOL module uses — EVA's thin liquidity
        // makes the classic /swap/v1/quote reject it outright with
        // TOKEN_NOT_TRADABLE, even though a real (if pricier) route exists
        // through SOL. Confirmed by hand before switching this over; see
        // the comment above getUltraOrder in jupiter.ts for the full story.
        // settings.slippageBps is not used here — Ultra manages its own
        // execution slippage.
        const buyAmountUsd = Number(settings.buyAmountUsd);
        const order = await getUltraOrder({
            inputMint: USDC_MINT,
            outputMint: EVA_MINT,
            amount: toRawAmount(buyAmountUsd, USDC_DECIMALS),
            taker: keypair.publicKey.toBase58(),
        });
        const { signature: buyTxSignature, outAmountRaw, feeLamports } = await executeUltraOrder(order, keypair);

        // Actual filled amount, not the pre-trade quote — meaningful here
        // given EVA's price impact is a few percent, not a rounding error.
        const evaAcquired = fromRawAmount(outAmountRaw, EVA_DECIMALS);
        const buyPriceUsd = buyAmountUsd / evaAcquired;
        // Network fee is paid in SOL (the gas token) regardless of which
        // SPL token is being traded — convert to USD via the SOL price at
        // buy time, same approach as the SOL module (a few thousand
        // lamports, well under a cent either way).
        const solPriceUsd = await getTokenPriceUsd(SOL_MINT).catch(() => 0);
        const buyFeeUsd = (feeLamports / 10 ** SOL_DECIMALS) * solPriceUsd;

        const lot = await db.evaLot.create({
            data: {
                userId,
                status: "PENDING_SELL_ORDER",
                buyAmountUsd,
                evaAcquired,
                buyPriceUsd,
                buyFeeUsd,
                buyTxSignature,
                evaRemaining: evaAcquired,
            },
        });

        // 2) Place the take-profit sell order for the configured USD slice of this lot.
        try {
            const targetPriceUsd = buyPriceUsd * (1 + Number(settings.takeProfitPercent) / 100);
            const sellAmountEva = sellAmountUsd / targetPriceUsd;

            const { orderKey, txSignature } = await createTriggerSellOrder({
                keypair,
                inputMint: EVA_MINT,
                outputMint: USDC_MINT,
                makingAmountRaw: toRawAmount(sellAmountEva, EVA_DECIMALS),
                takingAmountRaw: toRawAmount(sellAmountUsd, USDC_DECIMALS),
            });

            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    sellAmountEvaPlanned: sellAmountEva,
                    jupiterOrderKey: orderKey,
                    sellOrderCreatedAt: new Date(),
                    sellOrderTxSignature: txSignature,
                },
            });

            await notifyOrderPlaced({
                chain: "Solana",
                tokenSymbol: "Eva",
                buyAmountUsd,
                tokenAcquired: evaAcquired,
                buyPriceUsd,
                targetPriceUsd,
                takeProfitPercent: Number(settings.takeProfitPercent),
                sellAmountPlanned: sellAmountEva,
                buyTxUrl: `https://solscan.io/tx/${buyTxSignature}`,
            });
        } catch (sellErr) {
            // Buy already succeeded and is on-chain — don't lose that. Leave the
            // lot as PENDING_SELL_ORDER so the next cron run (or a manual retry)
            // can attempt to place the sell order again.
            const message = sellErr instanceof Error ? sellErr.message : String(sellErr);
            await db.evaLot.update({
                where: { id: lot.id },
                data: { notes: `Sell order creation failed: ${message}` },
            });
        }

        await db.evaSettings.update({
            where: { userId },
            data: { lastRunAt: new Date(), lastRunStatus: "ok", lastRunError: null },
        });

        return { userId, action: "bought", lotId: lot.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.evaSettings.update({
            where: { userId },
            data: { lastRunStatus: "error", lastRunError: message },
        });
        return { userId, action: "error", reason: message };
    }
}

/** Entry point for the cron endpoint — runs every enabled user's cycle. */
export async function runEvaDcaForAllUsers(): Promise<DcaRunResult[]> {
    // Sweep has its own independent toggle (sweepEnabled) — a user could
    // want auto-sweep running even with DCA buying paused, or vice versa —
    // so this pulls in anyone opted into either, and only calls each
    // routine when its own flag is on.
    const settingsRows = await db.evaSettings.findMany({
        where: { OR: [{ enabled: true }, { sweepEnabled: true }] },
    });
    const results: DcaRunResult[] = [];
    for (const s of settingsRows) {
        if (s.enabled) {
            results.push(await runEvaDcaForUser(s.userId));
        }
        if (s.sweepEnabled) {
            try {
                await runEvaSweepForUser(s.userId);
            } catch (err) {
                console.error(`Eva sweep failed for user ${s.userId}`, err);
            }
        }
    }
    return results;
}

/** Current EVA price + a quick portfolio-level snapshot, for the settings page. */
export async function getEvaQuickStats(userId: string) {
    const [settings, lots, price] = await Promise.all([
        db.evaSettings.findUnique({ where: { userId } }),
        db.evaLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } }),
        getTokenPriceUsd(EVA_MINT).catch(() => null),
    ]);
    return { settings, lots, evaPriceUsd: price };
}
