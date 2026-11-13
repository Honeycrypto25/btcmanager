import "server-only";
import { db } from "@/lib/db";
import { loadBotKeypair, getUsdcBalance } from "./wallet";
import { cancelTriggerV1Order, createTriggerBuyOrder, getActiveTriggerOrders, getHistoricalTriggerOrder, getSolPriceUsd } from "./jupiter";
import { MIN_TRIGGER_ORDER_USD, SOL_DECIMALS, SOL_MINT, USDC_DECIMALS, USDC_MINT } from "./constants";

const toRaw = (amount: number, decimals: number) => Math.round(amount * 10 ** decimals).toString();
const fromRaw = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;

export async function listSolanaLimitBuys(userId: string) {
    return db.solanaBuyOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 });
}

/**
 * Places one resting limit buy: `amountUsd` USDC -> SOL once the price falls to
 * `limitPriceUsd`. Refuses a limit at/above the current price (that is a market
 * buy, use "Cumpără acum"), a size below Jupiter's minimum, or more USDC than the
 * wallet holds (Jupiter escrows the USDC, so the wallet balance is the free amount).
 */
export async function createSolanaLimitBuy(
    userId: string,
    input: { amountUsd: number; limitPriceUsd: number },
    meta: { auto?: boolean; anchorPriceUsd?: number } = {},
) {
    const { amountUsd, limitPriceUsd } = input;
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_TRIGGER_ORDER_USD) {
        throw new Error(`Suma trebuie să fie de cel puțin $${MIN_TRIGGER_ORDER_USD} (minim impus de Jupiter).`);
    }
    if (!Number.isFinite(limitPriceUsd) || limitPriceUsd <= 0) throw new Error("Prețul limită trebuie să fie pozitiv.");

    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings) throw new Error("Salvează întâi setările botului.");
    const keypair = loadBotKeypair();
    if (keypair.publicKey.toBase58() !== settings.walletAddress) {
        throw new Error("SOLANA_PRIVATE_KEY nu corespunde wallet-ului din setări — refuz să tranzacționez.");
    }

    const [priceNow, balance] = await Promise.all([getSolPriceUsd(), getUsdcBalance(settings.walletAddress)]);
    if (limitPriceUsd >= priceNow) {
        throw new Error(`Prețul limită ($${limitPriceUsd}) trebuie să fie sub prețul curent ($${priceNow.toFixed(2)}). Pentru cumpărare imediată folosește „Cumpără acum”.`);
    }
    if (balance < amountUsd) {
        throw new Error(`USDC insuficient: în portofel sunt $${balance.toFixed(2)}, iar ordinul cere $${amountUsd.toFixed(2)}.`);
    }

    const solPlanned = amountUsd / limitPriceUsd;
    const { orderKey, txSignature } = await createTriggerBuyOrder({
        keypair,
        usdcMint: USDC_MINT,
        solMint: SOL_MINT,
        makingAmountRaw: toRaw(amountUsd, USDC_DECIMALS),
        takingAmountRaw: toRaw(solPlanned, SOL_DECIMALS),
    });

    return db.solanaBuyOrder.create({
        data: {
            userId,
            amountUsd,
            limitPriceUsd,
            solPlanned,
            jupiterOrderKey: orderKey,
            txSignature,
            auto: meta.auto === true,
            anchorPriceUsd: meta.anchorPriceUsd ?? null,
        },
    });
}

/** Cancels one open limit buy (a small network fee); the escrowed USDC returns to the wallet. */
export async function cancelSolanaLimitBuy(userId: string, id: string, note = "Anulat manual.") {
    const order = await db.solanaBuyOrder.findFirst({ where: { id, userId } });
    if (!order) throw new Error("Ordinul nu există.");
    if (order.status !== "OPEN") throw new Error("Ordinul nu mai e activ.");

    const keypair = loadBotKeypair();
    try {
        await cancelTriggerV1Order({ keypair, orderKey: order.jupiterOrderKey });
    } catch (e) {
        // Already gone from Jupiter's active list (filled or cancelled elsewhere)? Let the next check settle its real state instead of guessing here.
        const active = await getActiveTriggerOrders(keypair.publicKey.toBase58());
        if (active.has(order.jupiterOrderKey)) throw e;
        throw new Error("Ordinul nu mai e activ la Jupiter (probabil executat) — apasă „Verifică ordinele”.");
    }
    return db.solanaBuyOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: note } });
}

export interface LimitBuyReconcileResult {
    checked: number;
    filled: number;
    cancelled: number;
}

/**
 * Settles every OPEN limit buy against Jupiter. A filled order becomes a normal
 * SolanaLot (PENDING_SELL_ORDER); the caller then runs retryPendingSellOrders so the
 * take-profit sell order is placed by the same code path as after any other buy.
 */
export async function reconcileSolanaLimitBuys(userId: string, walletAddress: string): Promise<LimitBuyReconcileResult> {
    const open = await db.solanaBuyOrder.findMany({ where: { userId, status: "OPEN" } });
    const result: LimitBuyReconcileResult = { checked: open.length, filled: 0, cancelled: 0 };
    if (open.length === 0) return result;

    const active = await getActiveTriggerOrders(walletAddress);
    const now = new Date();

    for (const o of open) {
        if (active.has(o.jupiterOrderKey)) {
            await db.solanaBuyOrder.update({ where: { id: o.id }, data: { lastCheckedAt: now } });
            continue;
        }
        const order = await getHistoricalTriggerOrder(walletAddress, o.jupiterOrderKey);
        if (!order) {
            // Not in history yet (propagation delay right after creation) — look again next run rather than guess.
            await db.solanaBuyOrder.update({ where: { id: o.id }, data: { lastCheckedAt: now } });
            continue;
        }

        if (order.status === "Completed") {
            // Sum every trade (the order may have filled in pieces); raw* fields are atomic units.
            const trades = order.trades ?? [];
            const usdcSpent = trades.length ? trades.reduce((s, t) => s + fromRaw(t.rawInputAmount, USDC_DECIMALS), 0) : fromRaw(order.rawMakingAmount, USDC_DECIMALS);
            const solAcquired = trades.length ? trades.reduce((s, t) => s + fromRaw(t.rawOutputAmount, SOL_DECIMALS), 0) : fromRaw(order.rawTakingAmount, SOL_DECIMALS);
            // Fees charged in SOL come out of what actually arrived.
            const feeSol = trades.reduce((s, t) => s + (t.feeMint === SOL_MINT ? fromRaw(t.rawFeeAmount, SOL_DECIMALS) : 0), 0);
            const solNet = Math.max(0, solAcquired - feeSol);
            const boughtAt = trades.length && trades[trades.length - 1].confirmedAt ? new Date(trades[trades.length - 1].confirmedAt) : now;
            if (!(solNet > 0) || !(usdcSpent > 0)) {
                await db.solanaBuyOrder.update({ where: { id: o.id }, data: { lastCheckedAt: now, notes: "Executat, dar sumele nu au putut fi citite — verifică manual." } });
                continue;
            }
            // Atomic: the lot and the order's FILLED state are written together so a crash can't create a lot twice.
            await db.$transaction(async (tx) => {
                const claimed = await tx.solanaBuyOrder.updateMany({ where: { id: o.id, status: "OPEN" }, data: { status: "FILLED", filledAt: now, lastCheckedAt: now } });
                if (claimed.count !== 1) return;
                const lot = await tx.solanaLot.create({
                    data: {
                        userId,
                        status: "PENDING_SELL_ORDER",
                        buyAmountUsd: usdcSpent,
                        solAcquired: solNet,
                        buyPriceUsd: usdcSpent / solNet,
                        buyFeeUsd: 0,
                        buyTxSignature: trades[0]?.txId ?? null,
                        boughtAt,
                        solRemaining: solNet,
                        notes: o.auto ? "Cumpărat prin ordin limit automat (dip)." : "Cumpărat prin ordin limit.",
                    },
                });
                await tx.solanaBuyOrder.update({ where: { id: o.id }, data: { lotId: lot.id } });
            });
            result.filled++;
        } else if (order.status === "Cancelled") {
            await db.solanaBuyOrder.update({
                where: { id: o.id },
                data: { status: "CANCELLED", cancelledAt: now, lastCheckedAt: now, notes: o.notes ?? "Anulat la Jupiter." },
            });
            result.cancelled++;
        } else {
            await db.solanaBuyOrder.update({ where: { id: o.id }, data: { lastCheckedAt: now } });
        }
    }
    return result;
}

/**
 * Auto "dip" order: keep exactly ONE resting limit buy at `autoDipPercent` below the
 * price of the most recent buy. When a newer buy moves that reference price by at least
 * `autoDipMinMovePercent`, the old order is cancelled and a new one placed. Never throws:
 * the outcome is stored in autoDipLastNote so the daily DCA run is unaffected.
 */
export async function syncAutoDipOrder(userId: string): Promise<string> {
    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings || !settings.autoDipEnabled) return "off";
    const note = async (text: string) => {
        await db.solanaSettings.update({ where: { userId }, data: { autoDipLastAt: new Date(), autoDipLastNote: text } });
        return text;
    };
    try {
        const pct = Number(settings.autoDipPercent);
        const amountUsd = Number(settings.autoDipAmountUsd);
        const minMove = Number(settings.autoDipMinMovePercent);
        if (!(pct > 0 && pct < 90)) return await note("Procent invalid (0–90%).");
        if (!(amountUsd >= MIN_TRIGGER_ORDER_USD)) return await note(`Suma ordinului trebuie să fie de cel puțin $${MIN_TRIGGER_ORDER_USD}.`);

        const last = await db.solanaLot.findFirst({
            where: { userId, status: { in: ["OPEN", "FILLED", "PENDING_SELL_ORDER"] } },
            orderBy: { boughtAt: "desc" },
            select: { buyPriceUsd: true },
        });
        if (!last) return await note("Nicio cumpărare încă — nu am un preț de referință.");
        const anchor = Number(last.buyPriceUsd);
        const target = Math.round(anchor * (1 - pct / 100) * 10000) / 10000;

        const existing = await db.solanaBuyOrder.findFirst({ where: { userId, status: "OPEN", auto: true }, orderBy: { createdAt: "desc" } });
        if (existing) {
            const old = Number(existing.anchorPriceUsd ?? 0);
            const moved = old > 0 ? (Math.abs(anchor - old) / old) * 100 : 100;
            if (moved < minMove) {
                return await note(`Ordin activ la $${Number(existing.limitPriceUsd).toFixed(2)} (${pct}% sub $${old.toFixed(2)}); referința s-a mișcat doar ${moved.toFixed(1)}%, îl las.`);
            }
        }

        const priceNow = await getSolPriceUsd();
        if (target >= priceNow) {
            return await note(`Prețul curent ($${priceNow.toFixed(2)}) e deja sub ținta de $${target.toFixed(2)}; nu plasez (ar fi cumpărare la piață).`);
        }

        // Keep enough USDC for the next regular DCA buy on top of the order's own amount.
        const balance = await getUsdcBalance(settings.walletAddress);
        const returning = existing ? Number(existing.amountUsd) : 0; // comes back to the wallet when the old order is cancelled
        const need = amountUsd + Number(settings.buyAmountUsd);
        if (balance + returning < need) {
            return await note(`USDC insuficient pentru ordin ($${amountUsd}) + următoarea cumpărare automată ($${Number(settings.buyAmountUsd)}): în portofel $${(balance + returning).toFixed(2)}.`);
        }

        if (existing) await cancelSolanaLimitBuy(userId, existing.id, `Repoziționat: referința a trecut de la $${Number(existing.anchorPriceUsd ?? 0).toFixed(2)} la $${anchor.toFixed(2)}.`);
        const order = await createSolanaLimitBuy(userId, { amountUsd, limitPriceUsd: target }, { auto: true, anchorPriceUsd: anchor });
        return await note(`Ordin plasat: $${amountUsd} la $${Number(order.limitPriceUsd).toFixed(2)} (${pct}% sub $${anchor.toFixed(2)}).`);
    } catch (err) {
        return await note(`Eroare: ${err instanceof Error ? err.message : String(err)}`).catch(() => "error");
    }
}
