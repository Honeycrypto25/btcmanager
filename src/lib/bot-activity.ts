import "server-only";
import { db } from "@/lib/db";
import { getBotUptime, type BotUptime } from "@/lib/bot-uptime";
import { getBotProfits } from "@/lib/bot-profit";

export interface BotActivity {
    bot: string;
    label: string;
    enabled: boolean;
    lastOrderPlacedAt: Date | null;
    lastCheckedAt: Date | null;
    lastFinalizedAt: Date | null;
    /** Orders finalized (sell filled / buy-back filled) in the last 30 days. */
    finalized30d: number;
    /** Realized profit (USD) in the last 30 days — same measure as the Overview. */
    profit30d: number;
    uptime: BotUptime;
}

const latest = (...ds: (Date | null | undefined)[]): Date | null => {
    const v = ds.filter((d): d is Date => !!d).map((d) => d.getTime());
    return v.length ? new Date(Math.max(...v)) : null;
};

/** Last placed / checked / finalized order + 7/30-day uptime for every bot of the user. */
export async function getBotActivity(userId: string): Promise<BotActivity[]> {
    const out: BotActivity[] = [];
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const profits = new Map((await getBotProfits(userId)).map((p) => [p.key, p.profit30d]));

    // --- Buy-first DCA bots: Solana, Base, BNB, EVA ---
    const [solS, evmS, bnbS, evaS] = await Promise.all([
        db.solanaSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true, lastRunAt: true } }),
        db.evmSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true, lastRunAt: true } }),
        db.bnbSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true, lastRunAt: true } }),
        db.evaSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true, lastRunAt: true } }),
    ]);

    const lotBots = [
        { bot: "SOL", key: "sol", label: "Solana (SOL)", s: solS, lot: db.solanaLot, buyOrders: db.solanaBuyOrder },
        { bot: "BASE", key: "base", label: "Base (ETH)", s: evmS, lot: db.evmLot, buyOrders: db.evmBuyOrder },
        { bot: "BNB", key: "bnb", label: "BNB", s: bnbS, lot: db.bnbLot, buyOrders: null },
        { bot: "EVA", key: "eva", label: "EVA", s: evaS, lot: db.evaLot, buyOrders: null },
    ] as const;

    for (const b of lotBots) {
        if (!b.s) continue;
        const [agg, filled, bo, boFilled, count30] = await Promise.all([
            b.lot.aggregate({ where: { userId }, _max: { sellOrderCreatedAt: true, lastCheckedAt: true } }),
            b.lot.aggregate({ where: { userId, status: "FILLED" }, _max: { soldAt: true } }),
            b.buyOrders ? b.buyOrders.aggregate({ where: { userId }, _max: { createdAt: true, lastCheckedAt: true } }) : Promise.resolve(null),
            b.buyOrders ? b.buyOrders.aggregate({ where: { userId, status: "FILLED" }, _max: { filledAt: true } }) : Promise.resolve(null),
            b.lot.count({ where: { userId, status: "FILLED", soldAt: { gte: since30 } } }),
        ]);
        const uptime = await getBotUptime({ userId, bot: b.bot, label: b.label, enabled: b.s.enabled, intervalHours: b.s.intervalHours });
        out.push({
            bot: b.bot,
            label: b.label,
            enabled: b.s.enabled,
            lastOrderPlacedAt: latest(agg._max.sellOrderCreatedAt, bo?._max.createdAt),
            lastCheckedAt: latest(agg._max.lastCheckedAt, b.s.lastRunAt, bo?._max.lastCheckedAt),
            lastFinalizedAt: latest(filled._max.soldAt, boFilled?._max.filledAt),
            finalized30d: count30,
            profit30d: profits.get(b.key) ?? 0,
            uptime,
        });
    }

    // --- Polygon reverse-DCA: one row per token bot ---
    const polys = await db.polygonTokenSettings.findMany({ where: { userId }, orderBy: { tokenSymbol: "asc" } });
    for (const s of polys) {
        const [agg, filled, count30] = await Promise.all([
            db.polygonTokenLot.aggregate({ where: { settingsId: s.id }, _max: { buybackOrderCreatedAt: true, lastCheckedAt: true } }),
            db.polygonTokenLot.aggregate({ where: { settingsId: s.id, status: "FILLED" }, _max: { filledAt: true } }),
            db.polygonTokenLot.count({ where: { settingsId: s.id, status: "FILLED", filledAt: { gte: since30 } } }),
        ]);
        const uptime = await getBotUptime({ userId, bot: `POLYGON:${s.tokenSymbol}`, label: `Polygon · ${s.tokenSymbol}`, enabled: s.enabled, intervalHours: s.intervalHours, settingsId: s.id });
        out.push({
            bot: `POLYGON:${s.tokenSymbol}`,
            label: `Polygon · ${s.tokenSymbol}`,
            enabled: s.enabled,
            lastOrderPlacedAt: agg._max.buybackOrderCreatedAt,
            lastCheckedAt: latest(agg._max.lastCheckedAt, s.lastRunAt),
            lastFinalizedAt: filled._max.filledAt,
            finalized30d: count30,
            profit30d: profits.get(`poly-${s.id}`) ?? 0,
            uptime,
        });
    }
    return out;
}
