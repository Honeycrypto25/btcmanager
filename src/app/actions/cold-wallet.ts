"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSolPriceUsd, getTokenPriceUsd } from "@/lib/solana/jupiter";
import { getWethPriceUsd } from "@/lib/evm/oneinch";
import { getBnbPriceUsd } from "@/lib/bnb/oneinch";
import { EVA_MINT } from "@/lib/solana/constants";
import { priceForSweep } from "@/lib/sweep-price";

/**
 * Everything the bots have sent to a cold wallet, across all five sweep
 * tables, normalised to one row shape for the /cold-wallet statistics.
 *
 * USD value: each sweep stores `priceUsd` at the moment it ran. Rows older
 * than that column have it null — for those we fall back to the bot's own
 * buy price on the lot closest in time (within ±3 days) and flag the row as
 * an estimate, rather than leaving the month at $0.
 */

export type ColdAsset = "SOL" | "EVA" | "WETH" | "WBNB" | "USDC";

export interface ColdWalletSweep {
    id: string;
    asset: ColdAsset;
    createdAt: string;
    amount: number;
    priceUsd: number | null;
    priceSource: "recorded" | "lot-estimate" | null;
    manual: boolean;
    txId: string | null;
    txUrl: string | null;
}

/**
 * One card per bot for the current month: completed cycles and the profit
 * those cycles leave to be swept.
 *
 * - SOL / EVA / WETH / WBNB: a cycle completes when the lot's take-profit
 *   sell fills (status FILLED, soldAt). The sell only recovers the slice
 *   worth sellAmountUsd; the tokens left in the lot (xxxRemaining) are the
 *   profit, which is what the monthly sweep sends to the cold wallet.
 * - Polygon reverse-DCA (one card per token): a cycle completes when the
 *   buy-back fills (status FILLED, filledAt); its profit is usdcProfit.
 */
export interface ColdWalletBotCycles {
    key: string;
    label: string;
    chain: string;
    profitAsset: ColdAsset;
    cyclesThisMonth: number;
    cyclesLastMonth: number;
    profitTokens: number;
    profitUsdNow: number | null;
}

/** USDC profit made by one Polygon reverse-DCA token: one entry per completed cycle, dated when the buy-back filled. */
export interface ColdWalletTokenProfit {
    key: string;
    symbol: string;
    items: { at: string; usdc: number }[];
}

export interface ColdWalletData {
    sweeps: ColdWalletSweep[];
    polygonProfit: ColdWalletTokenProfit[];
    failedCount: number;
    currentPrices: Record<ColdAsset, number | null>;
    cycles: ColdWalletBotCycles[];
    monthStart: string;
}

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

const ESTIMATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type LotRow = { buyPriceUsd: unknown; boughtAt: Date };

/** Buy price of the non-failed lot closest in time to `at`, if one is within the window. */
function nearestLotPrice(lots: LotRow[], at: Date): number | null {
    let best: { diff: number; price: number } | null = null;
    for (const lot of lots) {
        const diff = Math.abs(lot.boughtAt.getTime() - at.getTime());
        if (diff > ESTIMATE_WINDOW_MS) continue;
        const price = Number(lot.buyPriceUsd);
        if (!Number.isFinite(price) || price <= 0) continue;
        if (!best || diff < best.diff) best = { diff, price };
    }
    return best ? best.price : null;
}

function lotWindow(dates: Date[]) {
    if (dates.length === 0) return null;
    const times = dates.map((d) => d.getTime());
    return {
        gte: new Date(Math.min(...times) - ESTIMATE_WINDOW_MS),
        lte: new Date(Math.max(...times) + ESTIMATE_WINDOW_MS),
    };
}

export async function getColdWalletData(): Promise<ColdWalletData> {
    const userId = await requireUserId();
    const success = { userId, status: "SUCCESS" };

    const [sol, eva, weth, wbnb, usdc, failedCounts] = await Promise.all([
        db.solanaSweep.findMany({ where: success, orderBy: { createdAt: "desc" } }),
        db.evaSweep.findMany({ where: success, orderBy: { createdAt: "desc" } }),
        db.evmSweep.findMany({ where: success, orderBy: { createdAt: "desc" } }),
        db.bnbSweep.findMany({ where: success, orderBy: { createdAt: "desc" } }),
        db.polygonTokenSweep.findMany({ where: success, orderBy: { createdAt: "desc" } }),
        Promise.all([
            db.solanaSweep.count({ where: { userId, status: "FAILED" } }),
            db.evaSweep.count({ where: { userId, status: "FAILED" } }),
            db.evmSweep.count({ where: { userId, status: "FAILED" } }),
            db.bnbSweep.count({ where: { userId, status: "FAILED" } }),
            db.polygonTokenSweep.count({ where: { userId, status: "FAILED" } }),
        ]),
    ]);

    // Lots are only needed for rows without a recorded price.
    const needs = (rows: { priceUsd: unknown; createdAt: Date }[]) =>
        lotWindow(rows.filter((r) => r.priceUsd == null).map((r) => r.createdAt));
    const lotSelect = { buyPriceUsd: true, boughtAt: true } as const;
    const [solW, evaW, wethW, wbnbW] = [needs(sol), needs(eva), needs(weth), needs(wbnb)];
    const [solLots, evaLots, wethLots, wbnbLots] = await Promise.all([
        solW ? db.solanaLot.findMany({ where: { userId, status: { not: "FAILED" }, boughtAt: solW }, select: lotSelect }) : [],
        evaW ? db.evaLot.findMany({ where: { userId, status: { not: "FAILED" }, boughtAt: evaW }, select: lotSelect }) : [],
        wethW ? db.evmLot.findMany({ where: { userId, status: { not: "FAILED" }, boughtAt: wethW }, select: lotSelect }) : [],
        wbnbW ? db.bnbLot.findMany({ where: { userId, status: { not: "FAILED" }, boughtAt: wbnbW }, select: lotSelect }) : [],
    ]);

    function price(recorded: unknown, at: Date, lots: LotRow[] | null): Pick<ColdWalletSweep, "priceUsd" | "priceSource"> {
        if (recorded != null) return { priceUsd: Number(recorded), priceSource: "recorded" };
        if (lots === null) return { priceUsd: 1, priceSource: "recorded" }; // USDC
        const est = nearestLotPrice(lots, at);
        return est != null ? { priceUsd: est, priceSource: "lot-estimate" } : { priceUsd: null, priceSource: null };
    }

    const sweeps: ColdWalletSweep[] = [
        ...sol.map((s) => ({
            id: s.id, asset: "SOL" as const, createdAt: s.createdAt.toISOString(), amount: Number(s.amountSol),
            ...price(s.priceUsd, s.createdAt, solLots), manual: s.manual, txId: s.txSignature,
            txUrl: s.txSignature ? `https://solscan.io/tx/${s.txSignature}` : null,
        })),
        ...eva.map((s) => ({
            id: s.id, asset: "EVA" as const, createdAt: s.createdAt.toISOString(), amount: Number(s.amountEva),
            ...price(s.priceUsd, s.createdAt, evaLots), manual: s.manual, txId: s.txSignature,
            txUrl: s.txSignature ? `https://solscan.io/tx/${s.txSignature}` : null,
        })),
        ...weth.map((s) => ({
            id: s.id, asset: "WETH" as const, createdAt: s.createdAt.toISOString(), amount: Number(s.amountWeth),
            ...price(s.priceUsd, s.createdAt, wethLots), manual: s.manual, txId: s.txHash,
            txUrl: s.txHash ? `https://basescan.org/tx/${s.txHash}` : null,
        })),
        ...wbnb.map((s) => ({
            id: s.id, asset: "WBNB" as const, createdAt: s.createdAt.toISOString(), amount: Number(s.amountBnb),
            ...price(s.priceUsd, s.createdAt, wbnbLots), manual: s.manual, txId: s.txHash,
            txUrl: s.txHash ? `https://bscscan.com/tx/${s.txHash}` : null,
        })),
        ...usdc.map((s) => ({
            id: s.id, asset: "USDC" as const, createdAt: s.createdAt.toISOString(), amount: Number(s.amountUsdc),
            ...price(s.priceUsd, s.createdAt, null), manual: s.manual, txId: s.txHash,
            txUrl: s.txHash ? `https://polygonscan.com/tx/${s.txHash}` : null,
        })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // --- Current-month cycles per bot (UTC month boundaries) ---
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const sinceLast = { gte: lastMonthStart };
    const filled = "FILLED" as const;

    const [solSet, evaSet, evmSet, bnbSet, polySettings, solCyc, evaCyc, wethCyc, wbnbCyc, polyCyc] = await Promise.all([
        db.solanaSettings.findUnique({ where: { userId }, select: { id: true } }),
        db.evaSettings.findUnique({ where: { userId }, select: { id: true } }),
        db.evmSettings.findUnique({ where: { userId }, select: { id: true } }),
        db.bnbSettings.findUnique({ where: { userId }, select: { id: true } }),
        db.polygonTokenSettings.findMany({ where: { userId }, select: { id: true, tokenSymbol: true }, orderBy: { createdAt: "asc" } }),
        db.solanaLot.findMany({ where: { userId, status: filled, soldAt: sinceLast }, select: { soldAt: true, solRemaining: true } }),
        db.evaLot.findMany({ where: { userId, status: filled, soldAt: sinceLast }, select: { soldAt: true, evaRemaining: true } }),
        db.evmLot.findMany({ where: { userId, status: filled, soldAt: sinceLast }, select: { soldAt: true, wethRemaining: true } }),
        db.bnbLot.findMany({ where: { userId, status: filled, soldAt: sinceLast }, select: { soldAt: true, bnbRemaining: true } }),
        db.polygonTokenLot.findMany({ where: { userId, status: filled, filledAt: sinceLast }, select: { settingsId: true, filledAt: true, usdcProfit: true } }),
    ]);

    function tally<T>(rows: T[], at: (r: T) => Date | null, profit: (r: T) => number) {
        let cyclesThisMonth = 0;
        let cyclesLastMonth = 0;
        let profitTokens = 0;
        for (const r of rows) {
            const d = at(r);
            if (!d) continue;
            if (d >= monthStart) {
                cyclesThisMonth++;
                profitTokens += profit(r);
            } else {
                cyclesLastMonth++;
            }
        }
        return { cyclesThisMonth, cyclesLastMonth, profitTokens };
    }

    // A bot gets a card if it is configured or had cycles in either month.
    const botCycles: Omit<ColdWalletBotCycles, "profitUsdNow">[] = [];
    const solT = tally(solCyc, (r) => r.soldAt, (r) => Number(r.solRemaining));
    if (solSet || solCyc.length) botCycles.push({ key: "sol", label: "SOL DCA", chain: "Solana", profitAsset: "SOL", ...solT });
    const evaT = tally(evaCyc, (r) => r.soldAt, (r) => Number(r.evaRemaining));
    if (evaSet || evaCyc.length) botCycles.push({ key: "eva", label: "EVA DCA", chain: "Solana", profitAsset: "EVA", ...evaT });
    const wethT = tally(wethCyc, (r) => r.soldAt, (r) => Number(r.wethRemaining));
    if (evmSet || wethCyc.length) botCycles.push({ key: "weth", label: "WETH DCA", chain: "Base", profitAsset: "WETH", ...wethT });
    const wbnbT = tally(wbnbCyc, (r) => r.soldAt, (r) => Number(r.bnbRemaining));
    if (bnbSet || wbnbCyc.length) botCycles.push({ key: "wbnb", label: "WBNB DCA", chain: "BNB Chain", profitAsset: "WBNB", ...wbnbT });
    for (const ps of polySettings) {
        const t = tally(polyCyc.filter((l) => l.settingsId === ps.id), (r) => r.filledAt, (r) => Number(r.usdcProfit));
        botCycles.push({ key: `poly-${ps.id}`, label: `${ps.tokenSymbol} Reverse-DCA`, chain: "Polygon", profitAsset: "USDC", ...t });
    }

    // All-time cycle profit per Polygon token (the sweeps themselves are not
    // attributed to a token, so "what each token produced" comes from the cycles).
    const polyAll = polySettings.length
        ? await db.polygonTokenLot.findMany({
            where: { userId, status: filled, filledAt: { not: null } },
            select: { settingsId: true, filledAt: true, usdcProfit: true },
        })
        : [];
    const polygonProfit: ColdWalletTokenProfit[] = polySettings.map((ps) => ({
        key: ps.id,
        symbol: ps.tokenSymbol,
        items: polyAll
            .filter((l) => l.settingsId === ps.id && l.filledAt)
            .map((l) => ({ at: l.filledAt!.toISOString(), usdc: Number(l.usdcProfit) })),
    }));

    // Current prices only for assets that were swept or have a bot — avoids
    // hitting Jupiter/1inch for nothing (e.g. on an instance with no bots).
    const has = (a: ColdAsset) => sweeps.some((s) => s.asset === a) || botCycles.some((b) => b.profitAsset === a);
    const [pSol, pEva, pWeth, pWbnb] = await Promise.all([
        has("SOL") ? priceForSweep(getSolPriceUsd) : null,
        has("EVA") ? priceForSweep(() => getTokenPriceUsd(EVA_MINT)) : null,
        has("WETH") ? priceForSweep(getWethPriceUsd) : null,
        has("WBNB") ? priceForSweep(getBnbPriceUsd) : null,
    ]);

    const currentPrices: Record<ColdAsset, number | null> = { SOL: pSol, EVA: pEva, WETH: pWeth, WBNB: pWbnb, USDC: 1 };

    return {
        sweeps,
        polygonProfit,
        failedCount: failedCounts.reduce((a, b) => a + b, 0),
        currentPrices,
        cycles: botCycles.map((b) => {
            const p = currentPrices[b.profitAsset];
            return { ...b, profitUsdNow: p != null ? b.profitTokens * p : null };
        }),
        monthStart: monthStart.toISOString(),
    };
}
