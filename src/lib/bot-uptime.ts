import "server-only";
import { db } from "@/lib/db";

export type DayStatus = "ok" | "warn" | "error" | "missed" | "pending" | "nodata";

export interface UptimeDay {
    date: string; // yyyy-mm-dd (UTC)
    status: DayStatus;
    source: "log" | "lots" | "none"; // "lots" = estimated from the lot history (before logging started)
    note?: string;
}

export interface BotUptime {
    bot: string;
    label: string;
    enabled: boolean;
    trackedSince: string | null; // first day with a real run log
    days: UptimeDay[]; // last 30 days, oldest first
    pct7: number | null;
    pct30: number | null;
    counted7: number;
    counted30: number;
}

const DAY = 86_400_000;
const CRON_GRACE_HOUR_UTC = 11; // crons fire 09:00–09:50 UTC; after this, a missing run is a miss
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

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
    const todayKey = dayKey(now);
    const from = new Date(now.getTime() - 29 * DAY);
    from.setUTCHours(0, 0, 0, 0);

    const [runs, firstRun, lotDates] = await Promise.all([
        db.botRun.findMany({ where: { userId, bot, runAt: { gte: from } }, orderBy: { runAt: "asc" } }),
        db.botRun.findFirst({ where: { userId, bot }, orderBy: { runAt: "asc" }, select: { runAt: true } }),
        lotDatesFor(bot, userId, settingsId),
    ]);

    const trackedSince = firstRun ? dayKey(firstRun.runAt) : null;
    const latestRunByDay = new Map<string, (typeof runs)[number]>();
    for (const r of runs) latestRunByDay.set(dayKey(r.runAt), r); // asc order → last wins
    const lotDays = new Set(lotDates.map(dayKey));
    const firstLotDay = lotDates.length ? dayKey(new Date(Math.min(...lotDates.map((d) => d.getTime())))) : null;
    const expectsDaily = intervalHours <= 24;

    const days: UptimeDay[] = [];
    for (let i = 0; i < 30; i++) {
        const key = dayKey(new Date(from.getTime() + i * DAY));
        const run = latestRunByDay.get(key);
        if (run) {
            days.push({ date: key, status: run.status === "error" ? "error" : run.status === "warn" ? "warn" : "ok", source: "log", note: run.message ?? undefined });
            continue;
        }
        if (lotDays.has(key)) {
            days.push({ date: key, status: "ok", source: trackedSince && key >= trackedSince ? "log" : "lots", note: "ciclu cu cumpărare/vânzare înregistrat" });
            continue;
        }
        const logging = trackedSince !== null && key >= trackedSince;
        if (key === todayKey && now.getUTCHours() < CRON_GRACE_HOUR_UTC) {
            days.push({ date: key, status: "pending", source: "none", note: "încă nu a rulat azi" });
        } else if (logging) {
            days.push({ date: key, status: enabled ? "missed" : "nodata", source: "log", note: enabled ? "nicio rulare înregistrată" : "bot dezactivat" });
        } else if (enabled && expectsDaily && firstLotDay && key > firstLotDay) {
            days.push({ date: key, status: "missed", source: "lots", note: "estimat: nicio achiziție în ziua asta" });
        } else {
            days.push({ date: key, status: "nodata", source: "none" });
        }
    }

    const pct = (slice: UptimeDay[]) => {
        const counted = slice.filter((d) => d.status === "ok" || d.status === "warn" || d.status === "error" || d.status === "missed");
        const ok = counted.filter((d) => d.status === "ok").length;
        return { pct: counted.length ? (ok / counted.length) * 100 : null, counted: counted.length };
    };
    const p7 = pct(days.slice(-7));
    const p30 = pct(days);
    return { bot, label, enabled, trackedSince, days, pct7: p7.pct, pct30: p30.pct, counted7: p7.counted, counted30: p30.counted };
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
