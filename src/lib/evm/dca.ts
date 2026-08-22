import "server-only";
import { parseUnits, formatUnits } from "ethers";
import { db } from "@/lib/db";
import { loadConnectedBotWallet } from "./wallet";
import { runEvmSweepForUser } from "./sweep";
import {
    createTakeProfitSellOrder,
    executeSwap,
    getActiveOrders,
    getOrderByHash,
    getWethPriceUsd,
} from "./oneinch";
import { MIN_LIMIT_ORDER_USD, USDC_ADDRESS, USDC_DECIMALS, WETH_ADDRESS, WETH_DECIMALS } from "./constants";
import { notifyOrderPlaced, notifyOrderFilled } from "@/lib/email/tx-notify";

/** How long a placed take-profit order stays valid for before it expires unfilled. 90 days — generous, since there's no cost to leaving it open (gasless to place). */
const ORDER_EXPIRATION_SECONDS = 90 * 24 * 60 * 60;

export interface EvmDcaRunResult {
    userId: string;
    action: "skipped" | "bought" | "error";
    reason?: string;
    lotId?: string;
}

interface ReconcileResult {
    checked: number;
    filled: number;
    cancelled: number;
}

/**
 * Reconciles ALL of this user's OPEN lots against 1inch's orderbook in one
 * batched pass: a single (paginated) call fetches every currently-active
 * order for the wallet. Only lots whose order has DROPPED OUT of the
 * active list (filled, cancelled, or expired) get an individual lookup for
 * their final state. Every OPEN lot gets `lastCheckedAt` stamped
 * regardless. Mirrors reconcileOpenLots on the Solana side exactly.
 */
async function reconcileOpenLots(userId: string, walletAddress: string): Promise<ReconcileResult> {
    const openLots = await db.evmLot.findMany({ where: { userId, status: "OPEN" } });
    const result: ReconcileResult = { checked: openLots.length, filled: 0, cancelled: 0 };
    if (openLots.length === 0) return result;

    const activeOrders = await getActiveOrders(walletAddress);
    const now = new Date();

    for (const lot of openLots) {
        if (!lot.oneInchOrderHash) continue;

        if (activeOrders.has(lot.oneInchOrderHash)) {
            await db.evmLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        // No longer in the active (status=1) list — filled, cancelled, or expired.
        const order = await getOrderByHash(lot.oneInchOrderHash);
        if (!order) {
            // 1inch's orderbook indexer prunes very old orders — with nothing
            // left to inspect, treat it the same as a cancellation rather
            // than leaving the lot stuck OPEN forever.
            await db.evmLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", wethRemaining: lot.wethAcquired, lastCheckedAt: now, notes: "Ordinul nu mai apare în orderbook 1inch (probabil expirat)." },
            });
            result.cancelled++;
            continue;
        }

        const remaining = BigInt(order.remainingMakerAmount);
        if (remaining === 0n) {
            // Fully filled — our orders are fill-or-kill, so a full fill is
            // the only way remainingMakerAmount reaches exactly zero. The
            // Orderbook API doesn't expose which tx filled it, so
            // sellTxHash stays null (unlike buyTxHash, which is always our
            // own transaction).
            const wethSold = Number(formatUnits(order.data.makingAmount, WETH_DECIMALS));
            const proceedsUsd = Number(formatUnits(order.data.takingAmount, USDC_DECIMALS));
            const costBasisUsd = Number(lot.buyPriceUsd) * wethSold;
            // The buy-side gas fee applies to the WHOLE lot, not just the
            // slice being sold here — allocate it proportionally so a lot
            // that's only partially sold doesn't have the full buy fee
            // charged against just this sale. Tiny on Base (a fraction of
            // a cent) but this is what "net P&L" is supposed to mean per
            // the schema comment on realizedPnlUsd.
            const wethAcquiredNum = Number(lot.wethAcquired);
            const buyFeeShare = wethAcquiredNum > 0 ? Number(lot.buyFeeUsd) * (wethSold / wethAcquiredNum) : 0;
            const realizedPnlUsd = proceedsUsd - costBasisUsd - buyFeeShare;

            await db.evmLot.update({
                where: { id: lot.id },
                data: {
                    status: "FILLED",
                    soldAt: now, // 1inch doesn't report the actual fill time via this endpoint — best available signal is "no longer active as of this check"
                    wethSold,
                    sellProceedsUsd: proceedsUsd,
                    sellFeeUsd: 0, // resolver pays gas; no protocol cut on a vanilla (non-Fusion) limit order fill
                    realizedPnlUsd,
                    wethRemaining: Number(lot.wethAcquired) - wethSold,
                    lastCheckedAt: now,
                },
            });
            result.filled++;
            await notifyOrderFilled({
                chain: "Base (ETH)",
                tokenSymbol: "WETH",
                tokenSold: wethSold,
                sellProceedsUsd: proceedsUsd,
                realizedPnlUsd,
                sellFeeUsd: 0,
                // 1inch's Orderbook API doesn't expose which tx filled the order (see comment above), so no link.
            });
        } else {
            const reason = order.orderInvalidReason?.join(", ") ?? "cancelled or expired";
            await db.evmLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", wethRemaining: lot.wethAcquired, lastCheckedAt: now, notes: `Ordin invalidat: ${reason}` },
            });
            result.cancelled++;
        }
    }

    return result;
}

/** Manual "check now" — reconciles this user's open sell orders against 1inch without touching the buy side. */
export async function reconcileEvmOrdersForUser(userId: string): Promise<ReconcileResult> {
    const settings = await db.evmSettings.findUnique({ where: { userId } });
    if (!settings) return { checked: 0, filled: 0, cancelled: 0 };
    return reconcileOpenLots(userId, settings.walletAddress);
}

/**
 * Runs one DCA cycle for a single user: reconciles previously-open sell
 * orders, then — if `intervalHours` have elapsed since the last buy — buys
 * `buyAmountUsd` of WETH via 1inch's Classic Swap API and places a
 * take-profit limit order for `sellAmountUsd` of it at `+takeProfitPercent`.
 * Safe to call more often than the configured interval; it no-ops until
 * it's actually due. Mirrors runSolanaDcaForUser exactly.
 */
export async function runEvmDcaForUser(userId: string): Promise<EvmDcaRunResult> {
    const settings = await db.evmSettings.findUnique({ where: { userId } });
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
        if (sellAmountUsd < MIN_LIMIT_ORDER_USD) {
            throw new Error(`sellAmountUsd must be at least $${MIN_LIMIT_ORDER_USD}`);
        }

        const wallet = loadConnectedBotWallet();
        if ((await wallet.getAddress()).toLowerCase() !== settings.walletAddress.toLowerCase()) {
            throw new Error("BASE_PRIVATE_KEY does not match the wallet address configured in settings — refusing to trade.");
        }

        // 1) Buy: USDC -> WETH
        const buyAmountUsd = Number(settings.buyAmountUsd);
        const amountRaw = parseUnits(buyAmountUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS);
        const { txHash: buyTxHash, feeEth, dstAmountRaw } = await executeSwap(wallet, {
            srcToken: USDC_ADDRESS,
            dstToken: WETH_ADDRESS,
            amountRaw,
            slippageBps: settings.slippageBps,
        });

        const wethAcquired = Number(formatUnits(dstAmountRaw, WETH_DECIMALS));
        const buyPriceUsd = buyAmountUsd / wethAcquired;
        // Gas is paid in native ETH — convert to USD at the WETH price we just bought at (1 ETH == 1 WETH economically).
        const buyFeeUsd = feeEth * buyPriceUsd;

        const lot = await db.evmLot.create({
            data: {
                userId,
                status: "PENDING_SELL_ORDER",
                buyAmountUsd,
                wethAcquired,
                buyPriceUsd,
                buyFeeUsd,
                buyTxHash,
                wethRemaining: wethAcquired,
            },
        });

        // 2) Place the take-profit sell order for the configured USD slice of this lot.
        try {
            const targetPriceUsd = buyPriceUsd * (1 + Number(settings.takeProfitPercent) / 100);
            const sellAmountWeth = sellAmountUsd / targetPriceUsd;

            const { orderHash } = await createTakeProfitSellOrder(wallet, {
                makingAmountRaw: parseUnits(sellAmountWeth.toFixed(WETH_DECIMALS), WETH_DECIMALS),
                takingAmountRaw: parseUnits(sellAmountUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS),
                expirationSeconds: ORDER_EXPIRATION_SECONDS,
            });

            await db.evmLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    sellAmountWethPlanned: sellAmountWeth,
                    oneInchOrderHash: orderHash,
                    sellOrderCreatedAt: new Date(),
                },
            });

            await notifyOrderPlaced({
                chain: "Base (ETH)",
                tokenSymbol: "WETH",
                buyAmountUsd,
                tokenAcquired: wethAcquired,
                buyPriceUsd,
                targetPriceUsd,
                takeProfitPercent: Number(settings.takeProfitPercent),
                sellAmountPlanned: sellAmountWeth,
                buyTxUrl: `https://basescan.org/tx/${buyTxHash}`,
            });
        } catch (sellErr) {
            // Buy already succeeded and is on-chain — don't lose that. Leave the
            // lot as PENDING_SELL_ORDER so the next cron run (or a manual retry)
            // can attempt to place the sell order again.
            const message = sellErr instanceof Error ? sellErr.message : String(sellErr);
            await db.evmLot.update({
                where: { id: lot.id },
                data: { notes: `Sell order creation failed: ${message}` },
            });
        }

        await db.evmSettings.update({
            where: { userId },
            data: { lastRunAt: new Date(), lastRunStatus: "ok", lastRunError: null },
        });

        return { userId, action: "bought", lotId: lot.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.evmSettings.update({
            where: { userId },
            data: { lastRunStatus: "error", lastRunError: message },
        });
        return { userId, action: "error", reason: message };
    }
}

/** Entry point for the cron endpoint — runs every enabled user's cycle. */
export async function runEvmDcaForAllUsers(): Promise<EvmDcaRunResult[]> {
    const settingsRows = await db.evmSettings.findMany({
        where: { OR: [{ enabled: true }, { sweepEnabled: true }] },
    });
    const results: EvmDcaRunResult[] = [];
    for (const s of settingsRows) {
        if (s.enabled) {
            results.push(await runEvmDcaForUser(s.userId));
        }
        if (s.sweepEnabled) {
            try {
                await runEvmSweepForUser(s.userId);
            } catch (err) {
                console.error(`EVM sweep failed for user ${s.userId}`, err);
            }
        }
    }
    return results;
}

/** Current WETH price + a quick portfolio-level snapshot, for the settings page. */
export async function getEvmQuickStats(userId: string) {
    const [settings, lots, price] = await Promise.all([
        db.evmSettings.findUnique({ where: { userId } }),
        db.evmLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } }),
        getWethPriceUsd().catch(() => null),
    ]);
    return { settings, lots, wethPriceUsd: price };
}
