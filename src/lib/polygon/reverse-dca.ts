import "server-only";
import { parseUnits, formatUnits, type Wallet } from "ethers";
import { db } from "@/lib/db";
import type { PolygonTokenSettings } from "@prisma/client";
import { loadConnectedBotWallet, getTokenBalance } from "./wallet";
import {
    createLimitOrder,
    executeSwap,
    getActiveOrders,
    getOrderByHash,
    getTokenPriceUsd,
    getNativePriceUsd,
} from "./oneinch";
import { USDC_ADDRESS, USDC_DECIMALS } from "./constants";
import { notifyTokenSold, notifyRebuyOrderPlaced, notifyRebuyFilled } from "@/lib/email/tx-notify";

/** How long a placed buy-back order stays valid for before it expires unfilled. 90 days — same as Base/BNB's take-profit orders, no cost to leaving it open (gasless to place). */
const ORDER_EXPIRATION_SECONDS = 90 * 24 * 60 * 60;

export interface PolygonDcaRunResult {
    settingsId: string;
    tokenSymbol: string;
    action: "skipped" | "sold" | "error";
    reason?: string;
    lotId?: string;
}

interface ReconcileResult {
    checked: number;
    filled: number;
    cancelled: number;
}

/**
 * Reconciles ALL of this token-settings' OPEN lots against 1inch's
 * orderbook in one batched pass. Structurally identical to
 * reconcileOpenLots in src/lib/evm/dca.ts — the only real difference is
 * which side of the fill is which: here the lot's order has the WALLET as
 * maker of USDC, so a full fill means makingAmount USDC was spent and
 * takingAmount of the token was received back (the reverse of Base/BNB's
 * take-profit sell, where the wallet is the maker of the traded token).
 */
async function reconcileOpenLots(settings: PolygonTokenSettings): Promise<ReconcileResult> {
    const openLots = await db.polygonTokenLot.findMany({ where: { settingsId: settings.id, status: "OPEN" } });
    const result: ReconcileResult = { checked: openLots.length, filled: 0, cancelled: 0 };
    if (openLots.length === 0) return result;

    const activeOrders = await getActiveOrders(settings.walletAddress);
    const now = new Date();

    for (const lot of openLots) {
        if (!lot.oneInchOrderHash) continue;

        if (activeOrders.has(lot.oneInchOrderHash)) {
            await db.polygonTokenLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        const order = await getOrderByHash(lot.oneInchOrderHash);
        if (!order) {
            await db.polygonTokenLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", lastCheckedAt: now, notes: "Ordinul nu mai apare în orderbook 1inch (probabil expirat)." },
            });
            result.cancelled++;
            continue;
        }

        const remaining = BigInt(order.remainingMakerAmount);
        if (remaining === 0n) {
            // Fill-or-kill, so a full fill is the only way remainingMakerAmount
            // reaches exactly zero. Wallet is maker of USDC here — makingAmount
            // is USDC spent, takingAmount is the token reacquired.
            const usdcSpent = Number(formatUnits(order.data.makingAmount, USDC_DECIMALS));
            const tokenReacquired = Number(formatUnits(order.data.takingAmount, settings.tokenDecimals));

            await db.polygonTokenLot.update({
                where: { id: lot.id },
                data: { status: "FILLED", filledAt: now, tokenReacquired, usdcSpent, lastCheckedAt: now },
            });
            result.filled++;

            await notifyRebuyFilled({
                tokenSymbol: settings.tokenSymbol,
                tokenReacquired,
                usdcSpent,
                buybackPriceUsd: tokenReacquired > 0 ? usdcSpent / tokenReacquired : 0,
                originalSellPriceUsd: Number(lot.sellPriceUsd),
            });
        } else {
            const reason = order.orderInvalidReason?.join(", ") ?? "cancelled or expired";
            await db.polygonTokenLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", lastCheckedAt: now, notes: `Ordin invalidat: ${reason}` },
            });
            result.cancelled++;
        }
    }

    return result;
}

/** Manual "check now" — reconciles this token's open buy-back orders against 1inch. */
export async function reconcilePolygonOrdersForSettings(settingsId: string): Promise<ReconcileResult> {
    const settings = await db.polygonTokenSettings.findUnique({ where: { id: settingsId } });
    if (!settings) return { checked: 0, filled: 0, cancelled: 0 };
    return reconcileOpenLots(settings);
}

/**
 * Retries placing the buy-back order for any lot stuck in
 * PENDING_BUYBACK_ORDER — the sell went through on-chain but something (an
 * RPC hiccup, a 1inch API error) prevented the buy-back order from being
 * created right after. Runs on every cron pass. Mirrors
 * retryPendingSellOrders in src/lib/evm/dca.ts.
 */
async function retryPendingBuybackOrders(settings: PolygonTokenSettings, wallet: Wallet): Promise<void> {
    const stuckLots = await db.polygonTokenLot.findMany({ where: { settingsId: settings.id, status: "PENDING_BUYBACK_ORDER" } });
    for (const lot of stuckLots) {
        try {
            const targetPriceUsd = Number(lot.sellPriceUsd) * (1 - Number(settings.buybackDipPercent) / 100);
            const usdcToBuyback = Number(lot.usdcToBuyback);
            // The exact quantity already sold (lot.tokenSold), not re-derived
            // via usdcToBuyback / targetPriceUsd -- that division reintroduces
            // float noise (e.g. 97.99999999999999 instead of a clean 98) even
            // though the buy-back is always supposed to target the EXACT
            // quantity sold (see the comment on usdcToBuyback in
            // runPolygonReverseDcaForSettings below).
            const tokenBuybackPlanned = Number(lot.tokenSold);

            const { orderHash } = await createLimitOrder(wallet, {
                makerAsset: USDC_ADDRESS,
                takerAsset: settings.tokenAddress,
                makingAmountRaw: parseUnits(usdcToBuyback.toFixed(USDC_DECIMALS), USDC_DECIMALS),
                takingAmountRaw: parseUnits(tokenBuybackPlanned.toFixed(settings.tokenDecimals), settings.tokenDecimals),
                expirationSeconds: ORDER_EXPIRATION_SECONDS,
            });

            await db.polygonTokenLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    tokenBuybackPlanned,
                    oneInchOrderHash: orderHash,
                    buybackOrderCreatedAt: new Date(),
                    notes: null,
                },
            });

            await notifyRebuyOrderPlaced({
                tokenSymbol: settings.tokenSymbol,
                tokenSold: Number(lot.tokenSold),
                sellPriceUsd: Number(lot.sellPriceUsd),
                usdcToBuyback,
                targetPriceUsd,
                buybackDipPercent: Number(settings.buybackDipPercent),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await db.polygonTokenLot.update({ where: { id: lot.id }, data: { notes: `Buy-back order retry failed: ${message}` } });
        }
    }
}

/**
 * Runs one reverse-DCA cycle for a single token-settings row: reconciles
 * open buy-back orders, retries any stuck order creation, then — if
 * `intervalHours` have elapsed since the last run — sells `sellAmountUsd`
 * worth (at the current market price, floored to a whole token) of whatever
 * GEOD/MYST balance is sitting in the wallet (accumulated from mining
 * rewards) into USDC via 1inch Classic Swap, and places a buy-back limit
 * order to re-acquire the EXACT SAME token quantity just sold, at
 * `buybackDipPercent`% below the sale price. The position is fully restored
 * once that order fills — never growing or shrinking. Whatever's left over
 * from the sale proceeds after fully funding that buy-back (`usdcProfit`) is
 * pure arbitrage profit, realized immediately in USDC — never reserved, and
 * eligible for the monthly sweep. Mirrors runEvmDcaForUser's interval gate
 * exactly, just selling instead of buying.
 */
export async function runPolygonReverseDcaForSettings(settingsId: string): Promise<PolygonDcaRunResult> {
    const settings = await db.polygonTokenSettings.findUnique({ where: { id: settingsId } });
    if (!settings) return { settingsId, tokenSymbol: "?", action: "skipped", reason: "not found" };
    if (!settings.enabled) return { settingsId, tokenSymbol: settings.tokenSymbol, action: "skipped", reason: "disabled" };

    try {
        await reconcileOpenLots(settings);

        const wallet = loadConnectedBotWallet();
        if ((await wallet.getAddress()).toLowerCase() !== settings.walletAddress.toLowerCase()) {
            throw new Error("BASE_PRIVATE_KEY does not match the wallet address configured in settings — refusing to trade.");
        }

        await retryPendingBuybackOrders(settings, wallet);

        const dueAt = settings.lastRunAt
            ? new Date(settings.lastRunAt.getTime() + settings.intervalHours * 60 * 60 * 1000)
            : null;
        if (dueAt && dueAt.getTime() > Date.now()) {
            return { settingsId, tokenSymbol: settings.tokenSymbol, action: "skipped", reason: `next sell due at ${dueAt.toISOString()}` };
        }

        const sellAmountUsd = Number(settings.sellAmountUsd);
        const priceUsd = await getTokenPriceUsd(settings.tokenAddress, settings.tokenDecimals, USDC_ADDRESS);
        // Rounded DOWN to a whole token — sells a clean "94 MYST" / "41 GEOD"
        // instead of a fractional amount, so the position sizes and realized
        // profit are easy to read at a glance. This means the actual USD sold
        // per cycle lands at or slightly above sellAmountUsd, never below.
        const tokenAmountToSell = Math.floor(sellAmountUsd / priceUsd);

        if (tokenAmountToSell <= 0) {
            return {
                settingsId,
                tokenSymbol: settings.tokenSymbol,
                action: "skipped",
                reason: `$${sellAmountUsd} is less than 1 ${settings.tokenSymbol} at the current price ($${priceUsd.toFixed(6)}) — raise sellAmountUsd`,
            };
        }

        const currentBalance = await getTokenBalance(settings.tokenAddress, settings.tokenDecimals, settings.walletAddress);
        if (currentBalance < tokenAmountToSell) {
            // Not enough mined yet to cover a full $sellAmountUsd cycle —
            // wait for more to accumulate rather than selling a partial
            // amount. lastRunAt is intentionally NOT updated here, so the
            // interval gate above doesn't push the next attempt out further.
            return {
                settingsId,
                tokenSymbol: settings.tokenSymbol,
                action: "skipped",
                reason: `only ${currentBalance.toFixed(4)} ${settings.tokenSymbol} available (~$${(currentBalance * priceUsd).toFixed(2)}) — need $${sellAmountUsd} worth`,
            };
        }

        // 1) Sell: token -> USDC
        const amountRaw = parseUnits(tokenAmountToSell.toFixed(settings.tokenDecimals), settings.tokenDecimals);
        const { txHash: sellTxHash, feeNative, dstAmountRaw } = await executeSwap(wallet, {
            srcToken: settings.tokenAddress,
            dstToken: USDC_ADDRESS,
            amountRaw,
            slippageBps: settings.slippageBps,
        });

        const usdcReceived = Number(formatUnits(dstAmountRaw, USDC_DECIMALS));
        const sellPriceUsd = usdcReceived / tokenAmountToSell;
        // Gas is paid in native POL, a different asset from the token sold —
        // needs its own price quote, unlike Base/BNB where gas (ETH/BNB) IS
        // economically the same asset being traded (WETH/WBNB).
        const nativePriceUsd = await getNativePriceUsd(USDC_ADDRESS).catch(() => 0);
        const sellFeeUsd = feeNative * nativePriceUsd;

        // Buy-back order always targets the EXACT quantity just sold (not a
        // fraction of the proceeds) — the position is fully restored once
        // the order fills, never growing or shrinking. Whatever's left over
        // from usdcReceived after fully re-funding that purchase at the
        // dipped target price is pure arbitrage profit, kept 100% in USDC.
        // e.g. sell 100 MYST @ $0.10 ($10 received), buy back 100 MYST @
        // $0.095 (-5% dip, $9.50 cost) -> $0.50 profit.
        const targetPriceUsdForBuyback = sellPriceUsd * (1 - Number(settings.buybackDipPercent) / 100);
        const usdcToBuyback = tokenAmountToSell * targetPriceUsdForBuyback;
        const usdcProfit = usdcReceived - usdcToBuyback;

        const lot = await db.polygonTokenLot.create({
            data: {
                userId: settings.userId,
                settingsId: settings.id,
                status: "PENDING_BUYBACK_ORDER",
                tokenSold: tokenAmountToSell,
                sellPriceUsd,
                usdcReceived,
                sellFeeUsd,
                sellTxHash,
                usdcToBuyback,
                usdcProfit,
            },
        });

        await notifyTokenSold({
            tokenSymbol: settings.tokenSymbol,
            tokenSold: tokenAmountToSell,
            sellPriceUsd,
            usdcReceived,
            usdcToBuyback,
            usdcProfit,
            sellTxUrl: `https://polygonscan.com/tx/${sellTxHash}`,
        });

        // 2) Place the buy-back order for the reinvested share, at -buybackDipPercent%.
        try {
            const targetPriceUsd = sellPriceUsd * (1 - Number(settings.buybackDipPercent) / 100);
            // The exact quantity just sold, not re-derived via
            // usdcToBuyback / targetPriceUsd -- that division reintroduces
            // float noise (e.g. 97.99999999999999 instead of a clean 98) even
            // though the buy-back is always supposed to target the EXACT
            // quantity sold (see the comment on usdcToBuyback just above).
            const tokenBuybackPlanned = tokenAmountToSell;

            const { orderHash } = await createLimitOrder(wallet, {
                makerAsset: USDC_ADDRESS,
                takerAsset: settings.tokenAddress,
                makingAmountRaw: parseUnits(usdcToBuyback.toFixed(USDC_DECIMALS), USDC_DECIMALS),
                takingAmountRaw: parseUnits(tokenBuybackPlanned.toFixed(settings.tokenDecimals), settings.tokenDecimals),
                expirationSeconds: ORDER_EXPIRATION_SECONDS,
            });

            await db.polygonTokenLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    tokenBuybackPlanned,
                    oneInchOrderHash: orderHash,
                    buybackOrderCreatedAt: new Date(),
                },
            });

            await notifyRebuyOrderPlaced({
                tokenSymbol: settings.tokenSymbol,
                tokenSold: tokenAmountToSell,
                sellPriceUsd,
                usdcToBuyback,
                targetPriceUsd,
                buybackDipPercent: Number(settings.buybackDipPercent),
            });
        } catch (buybackErr) {
            // Sell already succeeded and is on-chain — don't lose that. Leave
            // the lot PENDING_BUYBACK_ORDER for the next cron pass to retry.
            const message = buybackErr instanceof Error ? buybackErr.message : String(buybackErr);
            await db.polygonTokenLot.update({ where: { id: lot.id }, data: { notes: `Buy-back order creation failed: ${message}` } });
        }

        await db.polygonTokenSettings.update({
            where: { id: settings.id },
            data: { lastRunAt: new Date(), lastRunStatus: "ok", lastRunError: null },
        });

        return { settingsId, tokenSymbol: settings.tokenSymbol, action: "sold", lotId: lot.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.polygonTokenSettings.update({
            where: { id: settingsId },
            data: { lastRunStatus: "error", lastRunError: message },
        });
        return { settingsId, tokenSymbol: settings.tokenSymbol, action: "error", reason: message };
    }
}

/** Entry point for the cron endpoint — runs every enabled token-settings row, across all users. */
export async function runPolygonReverseDcaForAllSettings(): Promise<PolygonDcaRunResult[]> {
    const settingsRows = await db.polygonTokenSettings.findMany({ where: { enabled: true } });
    const results: PolygonDcaRunResult[] = [];
    for (const s of settingsRows) {
        results.push(await runPolygonReverseDcaForSettings(s.id));
    }
    return results;
}
