import "server-only";
import { db } from "@/lib/db";

export interface BotProfit {
    key: string;
    label: string;
    href: string;
    /** Realized profit (USD) over the last 30 days. */
    profit30d: number;
    /** Same measure over the 30 days before that, for the comparison line. */
    profitPrev30d: number;
    /** Closed cycles / sales counted in the last 30 days. */
    count30d: number;
    /** Open sell / buy-back orders still waiting. */
    openOrders: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

type DcaLot = { soldAt: Date | null; realizedPnlUsd: unknown };

function sumWindow<T>(rows: T[], dateOf: (r: T) => Date | null, valueOf: (r: T) => number, from: Date, to: Date) {
    let total = 0;
    let count = 0;
    for (const r of rows) {
        const d = dateOf(r);
        if (!d || d < from || d >= to) continue;
        total += valueOf(r);
        count++;
    }
    return { total, count };
}

function fromDcaLots(key: string, label: string, href: string, filled: DcaLot[], openOrders: number, now: Date): BotProfit {
    const cur = sumWindow(filled, (l) => l.soldAt, (l) => Number(l.realizedPnlUsd ?? 0), new Date(now.getTime() - 30 * DAY_MS), now);
    const prev = sumWindow(filled, (l) => l.soldAt, (l) => Number(l.realizedPnlUsd ?? 0), new Date(now.getTime() - 60 * DAY_MS), new Date(now.getTime() - 30 * DAY_MS));
    return { key, label, href, profit30d: cur.total, profitPrev30d: prev.total, count30d: cur.count, openOrders };
}

/**
 * Realized profit per bot over the last 30 days (and the 30 before, for
 * comparison). DCA bots (SOL, EVA, Base, BNB): realizedPnlUsd of lots whose
 * sell FILLED in the window. Polygon reverse-DCA: usdcProfit of each sale in
 * the window, per token (that profit is realized at sale time, not when the
 * buy-back fills).
 */
export async function getBotProfits(userId: string): Promise<BotProfit[]> {
    const now = new Date();
    const since = new Date(now.getTime() - 60 * DAY_MS);
    const where = { userId, status: "FILLED" as const, soldAt: { gte: since } };

    const [sol, eva, evm, bnb, solOpen, evaOpen, evmOpen, bnbOpen, polySettings, polyLots] = await Promise.all([
        db.solanaLot.findMany({ where, select: { soldAt: true, realizedPnlUsd: true } }),
        db.evaLot.findMany({ where, select: { soldAt: true, realizedPnlUsd: true } }),
        db.evmLot.findMany({ where, select: { soldAt: true, realizedPnlUsd: true } }),
        db.bnbLot.findMany({ where, select: { soldAt: true, realizedPnlUsd: true } }),
        db.solanaLot.count({ where: { userId, status: "OPEN" } }),
        db.evaLot.count({ where: { userId, status: "OPEN" } }),
        db.evmLot.count({ where: { userId, status: "OPEN" } }),
        db.bnbLot.count({ where: { userId, status: "OPEN" } }),
        db.polygonTokenSettings.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
        db.polygonTokenLot.findMany({
            where: { userId, status: { not: "FAILED" }, soldAt: { gte: since } },
            select: { settingsId: true, soldAt: true, usdcProfit: true, status: true },
        }),
    ]);

    const out: BotProfit[] = [
        fromDcaLots("sol", "Solana (SOL)", "/solana/stats", sol, solOpen, now),
        fromDcaLots("eva", "EVA", "/solana/eva/stats", eva, evaOpen, now),
        fromDcaLots("base", "Base (WETH)", "/base/stats", evm, evmOpen, now),
        fromDcaLots("bnb", "BNB", "/bnb/stats", bnb, bnbOpen, now),
    ];

    const from30 = new Date(now.getTime() - 30 * DAY_MS);
    const from60 = new Date(now.getTime() - 60 * DAY_MS);
    for (const s of polySettings) {
        const lots = polyLots.filter((l) => l.settingsId === s.id);
        const cur = sumWindow(lots, (l) => l.soldAt, (l) => Number(l.usdcProfit), from30, now);
        const prev = sumWindow(lots, (l) => l.soldAt, (l) => Number(l.usdcProfit), from60, from30);
        const open = await db.polygonTokenLot.count({ where: { settingsId: s.id, status: "OPEN" } });
        out.push({
            key: `poly-${s.id}`,
            label: `Polygon (${s.tokenSymbol})`,
            href: "/polygon/stats",
            profit30d: cur.total,
            profitPrev30d: prev.total,
            count30d: cur.count,
            openOrders: open,
        });
    }
    return out;
}
