/**
 * ok      = an order was executed that day (buy, or sell for the Polygon bots)
 * idle    = the cycle ran, but no order was due (interval not elapsed)
 * warn    = the cycle ran, an order was due, but there was no fuel (insufficient balance)
 * error   = the cycle ran with fuel available, but the order failed
 * missed  = the daily cycle did not run at all
 * nodata  = unknown (before the run log started, or bot disabled)
 */
export type DayStatus = "ok" | "idle" | "warn" | "error" | "missed" | "pending" | "nodata";

export interface UptimeDay {
    date: string; // yyyy-mm-dd (UTC)
    status: DayStatus;
    source: "log" | "lots" | "none"; // "lots" = known only from the lot history (before logging started)
    note?: string;
}

export interface StrikeWindow {
    pct: number | null; // executed / opportunities, null when there were no opportunities
    executed: number; // days with an executed order
    opportunities: number; // days the bot had fuel and an order due: executed + error + missed
    noFuel: number; // days an order was due but the balance was insufficient (not counted)
    unknown: number; // days with no information (not counted)
}

export interface BotUptime {
    bot: string;
    label: string;
    enabled: boolean;
    trackedSince: string | null; // first day with a real run log
    days: UptimeDay[]; // last 30 days, oldest first
    w7: StrikeWindow;
    w30: StrikeWindow;
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

/** Pure computation of the 30-day strip + 7/30-day strike: executed orders ÷ days the bot had fuel and an order due. */
export function computeUptime(input: UptimeInput & { bot: string; label: string }): BotUptime {
    const { now, enabled, runs, firstRunAt, lotDates, bot, label } = input;
    const todayKey = dayKey(now);
    const from = new Date(now.getTime() - 29 * DAY);
    from.setUTCHours(0, 0, 0, 0);
    const trackedSince = firstRunAt ? dayKey(firstRunAt) : null;
    const latestRunByDay = new Map<string, (typeof runs)[number]>();
    for (const r of runs) latestRunByDay.set(dayKey(r.runAt), r); // asc order → last wins
    const lotDays = new Set(lotDates.map(dayKey));

    const days: UptimeDay[] = [];
    for (let i = 0; i < 30; i++) {
        const key = dayKey(new Date(from.getTime() + i * DAY));
        const run = latestRunByDay.get(key);
        const tracked = trackedSince !== null && key >= trackedSince;
        // A lot created that day is proof an order was executed, whatever the last run of the day logged.
        if (lotDays.has(key)) {
            days.push({ date: key, status: "ok", source: tracked ? "log" : "lots", note: "ordin executat" });
            continue;
        }
        if (run) {
            const routine = run.status === "ok" && /^next (buy|sell) due/i.test(run.message ?? "");
            const status: DayStatus = run.status === "error" ? "error" : run.status === "warn" ? "warn" : routine ? "idle" : "ok";
            days.push({ date: key, status, source: "log", note: run.message ?? undefined });
            continue;
        }
        if (key === todayKey && now.getUTCHours() < CRON_GRACE_HOUR_UTC) {
            days.push({ date: key, status: "pending", source: "none", note: "încă nu a rulat azi" });
        } else if (tracked) {
            days.push({ date: key, status: enabled ? "missed" : "nodata", source: "log", note: enabled ? "nicio rulare înregistrată" : "bot dezactivat" });
        } else {
            // Before the run log existed there is no way to tell "no fuel" from "failed" from "not due".
            days.push({ date: key, status: "nodata", source: "none", note: "înainte de jurnalul rulărilor — nu se știe dacă botul avea combustibil" });
        }
    }

    const win = (slice: UptimeDay[]): StrikeWindow => {
        const n = (st: DayStatus) => slice.filter((d) => d.status === st).length;
        const executed = n("ok");
        const opportunities = executed + n("error") + n("missed");
        return { pct: opportunities ? (executed / opportunities) * 100 : null, executed, opportunities, noFuel: n("warn"), unknown: n("nodata") };
    };
    return { bot, label, enabled, trackedSince, days, w7: win(days.slice(-7)), w30: win(days) };
}
