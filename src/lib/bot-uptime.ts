import "server-only";
import { db } from "@/lib/db";

import { computeUptime, type BotUptime } from "@/lib/bot-uptime-calc";

const DAY = 86_400_000;
export type { BotUptime, UptimeDay, DayStatus } from "@/lib/bot-uptime-calc";

async function lotDatesFor(bot: string, userId: string, settingsId?: string): Promise<Date[]> {
    if (bot === "SOL") return (await db.solanaLot.findMany({ where: { userId, status: { not: "FAILED" } }, select: { boughtAt: true } })).map((l) => l.boughtAt);
    if (bot === "BASE") return (await db.evmLot.findMany({ where: { userId, status: { not: "FAILED" } }, select: { boughtAt: true } })).map((l) => l.boughtAt);
    if (bot === "BNB") return (await db.bnbLot.findMany({ where: { userId, status: { not: "FAILED" } }, select: { boughtAt: true } })).map((l) => l.boughtAt);
    if (bot === "EVA") return (await db.evaLot.findMany({ where: { userId, status: { not: "FAILED" } }, select: { boughtAt: true } })).map((l) => l.boughtAt);
    if (bot.startsWith("POLYGON:") && settingsId)
        return (await db.polygonTokenLot.findMany({ where: { settingsId, status: { not: "FAILED" } }, select: { soldAt: true } })).map((l) => l.soldAt);
    return [];
}

/**
 * Per-day activity of one bot over the last 30 days.
 * - Days since the run log started: real data (one cron row per day).
 * - Earlier days: estimated from the lot history (a lot that day = it ran; no lot on a day when a ≤24h bot
 *   should have bought = a miss). Estimated days are flagged `source: "lots"`.
 */
export async function getBotUptime(opts: { userId: string; bot: string; label: string; enabled: boolean; intervalHours: number; settingsId?: string }): Promise<BotUptime> {
    const { userId, bot, label, enabled, intervalHours, settingsId } = opts;
    const now = new Date();
    const from = new Date(now.getTime() - 29 * DAY);
    from.setUTCHours(0, 0, 0, 0);

    const [runs, firstRun, lotDates] = await Promise.all([
        db.botRun.findMany({ where: { userId, bot, runAt: { gte: from } }, orderBy: { runAt: "asc" } }),
        db.botRun.findFirst({ where: { userId, bot }, orderBy: { runAt: "asc" }, select: { runAt: true } }),
        lotDatesFor(bot, userId, settingsId),
    ]);

    return computeUptime({
        now,
        bot,
        label,
        enabled,
        intervalHours,
        runs: runs.map((r) => ({ runAt: r.runAt, status: r.status, message: r.message })),
        firstRunAt: firstRun?.runAt ?? null,
        lotDates,
    });
}

const LABELS = { SOL: "Solana (SOL)", BASE: "Base (ETH)", BNB: "BNB", EVA: "EVA" } as const;

/** Uptime for a single-settings DCA bot (SOL / BASE / BNB / EVA), loading its settings itself. */
export async function getDcaBotUptime(userId: string, bot: keyof typeof LABELS): Promise<BotUptime> {
    const s =
        bot === "SOL"
            ? await db.solanaSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true } })
            : bot === "BASE"
              ? await db.evmSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true } })
              : bot === "BNB"
                ? await db.bnbSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true } })
                : await db.evaSettings.findUnique({ where: { userId }, select: { enabled: true, intervalHours: true } });
    return getBotUptime({ userId, bot, label: LABELS[bot], enabled: s?.enabled ?? false, intervalHours: s?.intervalHours ?? 24 });
}

/** One uptime strip per Polygon token bot. */
export async function getPolygonUptimes(userId: string): Promise<BotUptime[]> {
    const rows = await db.polygonTokenSettings.findMany({ where: { userId }, select: { id: true, tokenSymbol: true, enabled: true, intervalHours: true }, orderBy: { tokenSymbol: "asc" } });
    return Promise.all(rows.map((r) => getBotUptime({ userId, bot: `POLYGON:${r.tokenSymbol}`, label: r.tokenSymbol, enabled: r.enabled, intervalHours: r.intervalHours, settingsId: r.id })));
}
