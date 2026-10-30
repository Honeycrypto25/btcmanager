import "server-only";
import { parseUnits, formatUnits } from "ethers";
import { db } from "@/lib/db";
import { loadConnectedBotWallet, getUsdcBalance } from "./wallet";
import { cancelLimitOrder, createLimitBuyOrder, getActiveOrders, getOrderByHash, getWethPriceUsd } from "./oneinch";
import { MIN_LIMIT_ORDER_USD, USDC_DECIMALS, WETH_DECIMALS } from "./constants";

/** Hard cap so a forgotten order can't sit around for years. */
const MAX_EXPIRATION_DAYS = 90;

/** USDC currently put up by this user's OPEN limit buys — automatic buys must leave it alone. */
export async function getReservedUsdc(userId: string): Promise<number> {
    const open = await db.evmBuyOrder.findMany({ where: { userId, status: "OPEN" }, select: { amountUsd: true } });
    return open.reduce((s, o) => s + Number(o.amountUsd), 0);
}

export async function listEvmLimitBuys(userId: string) {
    return db.evmBuyOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 });
}

/**
 * Places a resting limit order that buys WETH with `amountUsd` USDC once the
 * price falls to `limitPriceUsd`. Refuses anything that could go wrong
 * quietly: a limit at/above the current price (that is a market buy -- use
 * "Cumpără acum"), a size below the 1inch minimum, or more USDC than is
 * free once other open limit orders are accounted for.
 */
export async function createEvmLimitBuy(userId: string, input: { amountUsd: number; limitPriceUsd: number; expirationDays: number }) {
    const { amountUsd, limitPriceUsd } = input;
    const expirationDays = Math.min(MAX_EXPIRATION_DAYS, Math.max(1, Math.floor(input.expirationDays)));
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_LIMIT_ORDER_USD) {
        throw new Error(`Suma trebuie să fie de cel puțin $${MIN_LIMIT_ORDER_USD}.`);
    }
    if (!Number.isFinite(limitPriceUsd) || limitPriceUsd <= 0) throw new Error("Prețul limită trebuie să fie pozitiv.");

    const settings = await db.evmSettings.findUnique({ where: { userId } });
    if (!settings) throw new Error("Salvează întâi setările botului.");
    const wallet = loadConnectedBotWallet();
    if ((await wallet.getAddress()).toLowerCase() !== settings.walletAddress.toLowerCase()) {
        throw new Error("BASE_PRIVATE_KEY nu corespunde wallet-ului din setări — refuz să tranzacționez.");
    }

    const priceNow = await getWethPriceUsd();
    if (limitPriceUsd >= priceNow) {
        throw new Error(`Prețul limită ($${limitPriceUsd}) trebuie să fie sub prețul curent ($${priceNow.toFixed(2)}). Pentru cumpărare imediată folosește „Cumpără acum”.`);
    }

    const [balance, reserved] = await Promise.all([getUsdcBalance(settings.walletAddress), getReservedUsdc(userId)]);
    const free = balance - reserved;
    if (free < amountUsd) {
        throw new Error(`USDC insuficient: în portofel sunt $${balance.toFixed(2)}, din care $${reserved.toFixed(2)} sunt deja rezervați pentru alte ordine limit (liber: $${Math.max(0, free).toFixed(2)}).`);
    }

    const wethPlanned = amountUsd / limitPriceUsd;
    const { orderHash } = await createLimitBuyOrder(wallet, {
        makingAmountRaw: parseUnits(amountUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS),
        takingAmountRaw: parseUnits(wethPlanned.toFixed(WETH_DECIMALS), WETH_DECIMALS),
        expirationSeconds: expirationDays * 24 * 60 * 60,
    });

    return db.evmBuyOrder.create({
        data: {
            userId,
            amountUsd,
            limitPriceUsd,
            wethPlanned,
            oneInchOrderHash: orderHash,
            expiresAt: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000),
        },
    });
}

/** Cancels one open limit buy on-chain (a little gas) and frees its reserved USDC. */
export async function cancelEvmLimitBuy(userId: string, id: string) {
    const order = await db.evmBuyOrder.findFirst({ where: { id, userId } });
    if (!order) throw new Error("Ordinul nu există.");
    if (order.status !== "OPEN") throw new Error("Ordinul nu mai e activ.");

    const wallet = loadConnectedBotWallet();
    try {
        await cancelLimitOrder(wallet, order.oneInchOrderHash);
    } catch (e) {
        // Already gone from the orderbook (filled or expired)? Let the next check settle its real state instead of guessing here.
        const existing = await getOrderByHash(order.oneInchOrderHash);
        if (existing) throw e;
        throw new Error("Ordinul nu mai e în orderbook (probabil executat sau expirat) — apasă „Verifică ordinele”.");
    }
    return db.evmBuyOrder.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), notes: "Anulat manual." },
    });
}

export interface LimitBuyReconcileResult {
    checked: number;
    filled: number;
    cancelled: number;
}

/**
 * Settles every OPEN limit buy against 1inch's orderbook. A filled order
 * becomes a normal EvmLot (PENDING_SELL_ORDER) -- the caller then runs the
 * existing retryPendingSellOrders so the take-profit sell order is placed
 * by the same code path as after any other buy. Fills are detected by
 * remainingMakerAmount reaching 0 (the orders are fill-or-kill).
 */
export async function reconcileEvmLimitBuys(userId: string, walletAddress: string): Promise<LimitBuyReconcileResult> {
    const open = await db.evmBuyOrder.findMany({ where: { userId, status: "OPEN" } });
    const result: LimitBuyReconcileResult = { checked: open.length, filled: 0, cancelled: 0 };
    if (open.length === 0) return result;

    const active = await getActiveOrders(walletAddress);
    const now = new Date();

    for (const o of open) {
        if (active.has(o.oneInchOrderHash)) {
            await db.evmBuyOrder.update({ where: { id: o.id }, data: { lastCheckedAt: now } });
            continue;
        }
        const order = await getOrderByHash(o.oneInchOrderHash);
        if (!order) {
            // No record left to inspect: past its expiry it is simply expired; otherwise leave it OPEN and look again next time rather than guess.
            if (o.expiresAt.getTime() < Date.now()) {
                await db.evmBuyOrder.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledAt: now, lastCheckedAt: now, notes: "Expirat." } });
                result.cancelled++;
            } else {
                await db.evmBuyOrder.update({ where: { id: o.id }, data: { lastCheckedAt: now } });
            }
            continue;
        }

        if (BigInt(order.remainingMakerAmount) === 0n) {
            const usdcSpent = Number(formatUnits(order.data.makingAmount, USDC_DECIMALS));
            const wethAcquired = Number(formatUnits(order.data.takingAmount, WETH_DECIMALS));
            // Atomic: the lot and the order's FILLED state are written together so a crash can't create a lot twice.
            await db.$transaction(async (tx) => {
                const claimed = await tx.evmBuyOrder.updateMany({ where: { id: o.id, status: "OPEN" }, data: { status: "FILLED", filledAt: now, lastCheckedAt: now } });
                if (claimed.count !== 1) return;
                const lot = await tx.evmLot.create({
                    data: {
                        userId,
                        status: "PENDING_SELL_ORDER",
                        buyAmountUsd: usdcSpent,
                        wethAcquired,
                        buyPriceUsd: usdcSpent / wethAcquired,
                        buyFeeUsd: 0, // the resolver pays gas on a limit-order fill
                        boughtAt: now, // best available signal: the orderbook doesn't report the fill time
                        wethRemaining: wethAcquired,
                        notes: "Cumpărat prin ordin limit.",
                    },
                });
                await tx.evmBuyOrder.update({ where: { id: o.id }, data: { lotId: lot.id } });
            });
            result.filled++;
        } else {
            const reason = order.orderInvalidReason?.join(", ") ?? "anulat sau expirat";
            await db.evmBuyOrder.update({
                where: { id: o.id },
                data: { status: "CANCELLED", cancelledAt: now, lastCheckedAt: now, notes: `Ordin invalidat: ${reason}` },
            });
            result.cancelled++;
        }
    }
    return result;
}
