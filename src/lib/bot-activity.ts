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

    // One plain-typed loader per bot (the Prisma delegates differ per model, so they can't be
    // called through a shared union — each loader calls its own delegate and returns the same shape).
    type LotStats = {
        placed: Date | null; // latest sell order created
        checked: Date | null; // latest order check
        finalized: Date | null; // latest sell filled
        count30: number; // sells filled in the last 30 days
        buyPlaced: Date | null; // latest limit-buy order created (SOL/Base)
        buyChecked: Date | null;
        buyFinalized: Date | null;
    };
    const NO_BUY = { buyPlaced: null, buyChecked: null, buyFinalized: null };
    const loaders: Record<string, () => Promise<LotStats>> = {
        SOL: async () => {
            const [agg, filled, count30, bo, boFilled] = await Promise.all([
                db.solanaLot.aggregate({ where: { userId }, _max: { sellOrderCreatedAt: true, lastCheckedAt: true } }),
                db.solanaLot.aggregate({ where: { userId, status: "FILLED" }, _max: { soldAt: true } }),
                db.solanaLot.count({ where: { userId, status: "FILLED", soldAt: { gte: since30 } } }),
                db.solanaBuyOrder.aggregate({ where: { userId }, _max: { createdAt: true, lastCheckedAt: true } }),
                db.solanaBuyOrder.aggregate({ where: { userId, status: "FILLED" }, _max: { filledAt: true } }),
            ]);
            return { placed: agg._max.sellOrderCreatedAt, checked: agg._max.lastCheckedAt, finalized: filled._max.soldAt, count30, buyPlaced: bo._max.createdAt, buyChecked: bo._max.lastCheckedAt, buyFinalized: boFilled._max.filledAt };
        },
        BASE: async () => {
            const [agg, filled, count30, bo, boFilled] = await Promise.all([
                db.evmLot.aggregate({ where: { userId }, _max: { sellOrderCreatedAt: true, lastCheckedAt: true } }),
                db.evmLot.aggregate({ where: { userId, status: "FILLED" }, _max: { soldAt: true } }),
                db.evmLot.count({ where: { userId, status: "FILLED", soldAt: { gte: since30 } } }),
                db.evmBuyOrder.aggregate({ where: { userId }, _max: { createdAt: true, lastCheckedAt: true } }),
                db.evmBuyOrder.aggregate({ where: { userId, status: "FILLED" }, _max: { filledAt: true } }),
            ]);
            return { placed: agg._max.sellOrderCreatedAt, checked: agg._max.lastCheckedAt, finalized: filled._max.soldAt, count30, buyPlaced: bo._max.createdAt, buyChecked: bo._max.lastCheckedAt, buyFinalized: boFilled._max.filledAt };
        },
        BNB: async () => {
            const [agg, filled, count30] = await Promise.all([
                db.bnbLot.aggregate({ where: { userId }, _max: { sellOrderCreatedAt: true, lastCheckedAt: true } }),
                db.bnbLot.aggregate({ where: { userId, status: "FILLED" }, _max: { soldAt: true } }),
                db.bnbLot.count({ where: { userId, status: "FILLED", soldAt: { gte: since30 } } }),
            ]);
            return { placed: agg._max.sellOrderCreatedAt, checked: agg._max.lastCheckedAt, finalized: filled._max.soldAt, count30, ...NO_BUY };
        },
        EVA: async () => {
            const [agg, filled, count30] = await Promise.all([
                db.evaLot.aggregate({ where: { userId }, _max: { sellOrderCreatedAt: true, lastCheckedAt: true } }),
                db.evaLot.aggregate({ where: { userId, status: "FILLED" }, _max: { soldAt: true } }),
                db.evaLot.count({ where: { userId, status: "FILLED", soldAt: { gte: since30 } } }),
            ]);
            return { placed: agg._max.sellOrderCreatedAt, checked: agg._max.lastCheckedAt, finalized: filled._max.soldAt, count30, ...NO_BUY };
        },
    };

    const lotBots = [
        { bot: "SOL", key: "sol", label: "Solana (SOL)", s: solS },
        { bot: "BASE", key: "base", label: "Base (ETH)", s: evmS },
        { bot: "BNB", key: "bnb", label: "BNB", s: bnbS },
        { bot: "EVA", key: "eva", label: "EVA", s: evaS },
    ];

    for (const b of lotBots) {
        if (!b.s) continue;
        const st = await loaders[b.bot]();
        const uptime = await getBotUptime({ userId, bot: b.bot, label: b.label, enabled: b.s.enabled, intervalHours: b.s.intervalHours });
        out.push({
            bot: b.bot,
            label: b.label,
            enabled: b.s.enabled,
            lastOrderPlacedAt: latest(st.placed, st.buyPlaced),
            lastCheckedAt: latest(st.checked, b.s.lastRunAt, st.buyChecked),
            lastFinalizedAt: latest(st.finalized, st.buyFinalized),
            finalized30d: st.count30,
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
