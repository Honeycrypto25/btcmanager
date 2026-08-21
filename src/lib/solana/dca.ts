import "server-only";
import { db } from "@/lib/db";
import { loadBotKeypair } from "./wallet";
import {
    createTriggerSellOrder,
    executeSwap,
    getSolPriceUsd,
    getSwapQuote,
    getTriggerOrderStatus,
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
 * Reconciles any of this user's OPEN lots against Jupiter's Trigger API —
 * if the take-profit order has filled (or was cancelled) since we last
 * checked, updates the lot's status, proceeds and realized P&L. Runs once
 * per cycle, right before deciding whether a new buy is due.
 */
async function reconcileOpenLots(userId: string, walletAddress: string) {
    const openLots = await db.solanaLot.findMany({ where: { userId, status: "OPEN" } });

    for (const lot of openLots) {
        if (!lot.jupiterOrderKey) continue;
        const order = await getTriggerOrderStatus(walletAddress, lot.jupiterOrderKey);
        if (!order) continue;

        if (order.status === "Completed") {
            const fill = order.trades[0];
            const solSold = fill ? fromRawAmount(fill.inputAmount, SOL_DECIMALS) : fromRawAmount(order.makingAmount, SOL_DECIMALS);
            const proceedsUsd = fill ? fromRawAmount(fill.outputAmount, USDC_DECIMALS) : fromRawAmount(order.takingAmount, USDC_DECIMALS);
            // Fee is charged in the output token (USDC) when Jupiter takes one; 0 for plain trigger orders without a referral fee.
            const feeUsd = fill && fill.feeMint === USDC_MINT ? fromRawAmount(fill.feeAmount, USDC_DECIMALS) : 0;

            const costBasisUsd = Number(lot.buyPriceUsd) * solSold;
            const realizedPnlUsd = proceedsUsd - feeUsd - costBasisUsd;

            await db.solanaLot.update({
                where: { id: lot.id },
                data: {
                    status: "FILLED",
                    soldAt: fill ? new Date(fill.confirmedAt) : new Date(),
                    solSold,
                    sellProceedsUsd: proceedsUsd,
                    sellFeeUsd: feeUsd,
                    sellTxSignature: fill?.txId,
                    realizedPnlUsd,
                    solRemaining: Number(lot.solAcquired) - solSold,
                },
            });
        } else if (order.status === "Cancelled") {
            await db.solanaLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", solRemaining: lot.solAcquired },
            });
        }
        // "Open" — nothing to do, still waiting on the price target.
    }
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
    const enabledSettings = await db.solanaSettings.findMany({ where: { enabled: true } });
    const results: DcaRunResult[] = [];
    for (const s of enabledSettings) {
        results.push(await runSolanaDcaForUser(s.userId));
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
