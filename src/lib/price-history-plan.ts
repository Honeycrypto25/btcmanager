/**
 * Pure decisions for the daily price store (no DB / network), so they can be tested on their own.
 * Days are UTC (yyyy-mm-dd).
 */

export const DAY_MS = 86_400_000;
export const RECHECK_CLOSED_DAYS = 3; // closed days re-checked at every refresh, besides today
export const REFRESH_EVERY_MS = 6 * 60 * 60_000;
/**
 * A day is "closed" (final) at the daily check of 09:50 UTC the next day: until then a changed value is a normal
 * update, after it a change is a correction. The daily cron runs somewhere in the 09:00 UTC hour on the Hobby
 * plan, so the cron run closes the day whenever it fires in that hour; page visits close it only from 09:50.
 */
export const CLOSE_AFTER_MS = (9 * 60 + 50) * 60_000; // 09:50 UTC the next day
export const CLOSE_AFTER_DAILY_RUN_MS = 9 * 60 * 60_000; // the daily cron: anywhere from 09:00 UTC // today and the last closed days are re-checked at most every 6 hours

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (key: string) => Date.parse(`${key}T00:00:00.000Z`);

export interface Ohlc {
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface StoredDay extends Ohlc {
    day: string;
    finalizedAt: number | null; // ms
    checkedAt: number; // ms
}

export interface FetchedDay extends Ohlc {
    day: string;
}

export type DayAction =
    | { kind: "create"; day: string; values: Ohlc; finalize: boolean }
    | { kind: "update"; day: string; values: Ohlc; finalize: boolean } // today moving, or a closed day getting its final values
    | { kind: "correction"; day: string; old: Ohlc; values: Ohlc } // a day that was already final changed at the source
    | { kind: "touch"; day: string; recheck: boolean }; // asked again, nothing changed (recheck = it was already final)

/**
 * Which day to start downloading from, or null when nothing is due:
 * the first missing day since `fromDay`; otherwise, once the last check is older than 6 hours,
 * today and the last 3 closed days.
 */
export function refreshStart(stored: StoredDay[], fromDay: string, now: number, force = false): string | null {
    const lastCheck = stored.reduce((m, r) => Math.max(m, r.checkedAt), 0);
    // Checked less than 6 hours ago: a day still missing is one the source does not have yet
    // (e.g. today's candle right after midnight), so wait for the next round instead of asking on every visit.
    // The daily run (force) always checks, since that is the one that closes yesterday.
    if (!force && now - lastCheck < REFRESH_EVERY_MS) return null;
    const have = new Set(stored.map((r) => r.day));
    for (let t = dayStart(fromDay); t <= now; t += DAY_MS) {
        if (!have.has(dayKey(t))) return dayKey(t);
    }
    const recheck = dayKey(now - RECHECK_CLOSED_DAYS * DAY_MS);
    return recheck < fromDay ? fromDay : recheck;
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;
export const sameOhlc = (a: Ohlc, b: Ohlc) => same(a.open, b.open) && same(a.high, b.high) && same(a.low, b.low) && same(a.close, b.close);

/** What to do with each downloaded day, compared with what is stored. `dailyRun` = the 09:50 UTC cron. */
export function planDays(stored: StoredDay[], fetched: FetchedDay[], now: number, dailyRun = false): DayAction[] {
    const closeAfter = dailyRun ? CLOSE_AFTER_DAILY_RUN_MS : CLOSE_AFTER_MS;
    const byDay = new Map(stored.map((r) => [r.day, r]));
    const actions: DayAction[] = [];
    for (const f of fetched) {
        if (!(f.high > 0 && f.low > 0)) continue;
        // Closed = the day ended and its 09:50 UTC check of the next day has come.
        const closed = now >= dayStart(f.day) + DAY_MS + closeAfter;
        const values: Ohlc = { open: f.open, high: f.high, low: f.low, close: f.close };
        const row = byDay.get(f.day);
        if (!row) {
            actions.push({ kind: "create", day: f.day, values, finalize: closed });
        } else if (sameOhlc(row, values)) {
            // Unchanged: closes now if it is due, otherwise only the check is recorded (a recheck once it is final).
            actions.push(closed && row.finalizedAt === null ? { kind: "update", day: f.day, values, finalize: true } : { kind: "touch", day: f.day, recheck: row.finalizedAt !== null });
        } else if (row.finalizedAt !== null) {
            actions.push({ kind: "correction", day: f.day, old: { open: row.open, high: row.high, low: row.low, close: row.close }, values });
        } else {
            actions.push({ kind: "update", day: f.day, values, finalize: closed });
        }
    }
    return actions;
}
