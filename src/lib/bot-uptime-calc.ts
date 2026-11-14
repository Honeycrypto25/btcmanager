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
    est7: boolean; // true = the % comes only from lot-history estimates (no real log days in the window)
    est30: boolean;
}

const DAY = 86_400_000;
const CRON_GRACE_HOUR_UTC = 11; // crons fire 09:00–09:50 UTC; after this, a missing run is a miss
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface UptimeInput {
    now: Date;
    enabled: boolean;
    intervalHours: number;
    runs: { runAt: Date; status: string; message: string | null }[]; // within the last 30 days
    firstRunAt: Date | null;
    lotDates: Date[];
}

/** Pure computation of the 30-day strip + 7/30-day percentages (no DB access). */
export function computeUptime(input: UptimeInput & { bot: string; label: string }): BotUptime {
    const { now, enabled, intervalHours, runs, firstRunAt, lotDates, bot, label } = input;
    const todayKey = dayKey(now);
    const from = new Date(now.getTime() - 29 * DAY);
    from.setUTCHours(0, 0, 0, 0);
    const trackedSince = firstRunAt ? dayKey(firstRunAt) : null;
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

    // The % uses real log days when the window has any; only otherwise does it fall back to the
    // lot-history estimate (flagged `est`), since estimates can't tell a miss from a deliberate skip.
    const pct = (slice: UptimeDay[]) => {
        const isCounted = (d: UptimeDay) => d.status === "ok" || d.status === "warn" || d.status === "error" || d.status === "missed";
        const real = slice.filter((d) => isCounted(d) && d.source === "log");
        const used = real.length > 0 ? real : slice.filter(isCounted);
        const ok = used.filter((d) => d.status === "ok").length;
        return { pct: used.length ? (ok / used.length) * 100 : null, counted: used.length, est: real.length === 0 && used.length > 0 };
    };
    const p7 = pct(days.slice(-7));
    const p30 = pct(days);
    return { bot, label, enabled, trackedSince, days, pct7: p7.pct, pct30: p30.pct, counted7: p7.counted, counted30: p30.counted, est7: p7.est, est30: p30.est };
}
