/**
 * Where each buy landed inside its day's range (pure, no DB/network — shared by the client card and tests).
 * Days are UTC, same as the daily candles.
 */

export type TimingPeriod = "week" | "month" | "year";

export interface TimingCandle {
    day: string; // yyyy-mm-dd (UTC)
    high: number;
    low: number;
}

export interface TimingLot {
    id: string;
    boughtAt: string; // ISO
    buyPriceUsd: number;
    buyAmountUsd: number;
    via: "dca" | "limit" | "limit-auto"; // daily DCA / manual buy, or a filled limit buy order (automatic dip order)
}

export interface TimingRow extends TimingLot {
    t: number;
    day: string;
    low: number | null;
    high: number | null;
    /** 0 = bought at the day's low, 100 = at the day's high (clamped). null when that day has no candle. */
    position: number | null;
    /** % above the day's low (can be slightly negative when the DEX price dipped under the exchange low). */
    aboveLow: number | null;
    partial: boolean; // today, or yesterday before 09:50 UTC: the day's range is not final yet
}

export interface TimingBucket {
    key: string;
    label: string;
    n: number;
    avgPosition: number | null;
    avgAboveLow: number | null;
    lowerThird: number; // buys in the cheapest third of their day
    best: number | null; // lowest position
    worst: number | null; // highest position
}

const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function computeTimingRows(lots: TimingLot[], candles: TimingCandle[], now = new Date()): TimingRow[] {
    const byDay = new Map(candles.map((c) => [c.day, c]));
    // A day is final once its 09:50 UTC check of the next day has come (see price-history-plan).
    const notFinal = (day: string) => now.getTime() < Date.parse(`${day}T00:00:00.000Z`) + 86_400_000 + (9 * 60 + 50) * 60_000;
    return lots
        .map((l) => {
            const t = new Date(l.boughtAt).getTime();
            const day = dayKey(t);
            const c = byDay.get(day);
            if (!c || !(l.buyPriceUsd > 0)) return { ...l, t, day, low: c?.low ?? null, high: c?.high ?? null, position: null, aboveLow: null, partial: notFinal(day) };
            const span = c.high - c.low;
            const raw = span > 0 ? ((l.buyPriceUsd - c.low) / span) * 100 : 50;
            return {
                ...l,
                t,
                day,
                low: c.low,
                high: c.high,
                position: Math.min(100, Math.max(0, raw)),
                aboveLow: (l.buyPriceUsd / c.low - 1) * 100,
                partial: notFinal(day),
            };
        })
        .sort((a, b) => a.t - b.t);
}

/** Monday (UTC) of the week holding `t`, as yyyy-mm-dd. */
function weekStart(t: number): string {
    const d = new Date(t);
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    return dayKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
}

export function bucketOf(t: number, period: TimingPeriod): { key: string; label: string } {
    const d = new Date(t);
    if (period === "year") return { key: String(d.getUTCFullYear()), label: String(d.getUTCFullYear()) };
    if (period === "month") {
        const m = d.getUTCMonth();
        return { key: `${d.getUTCFullYear()}-${String(m + 1).padStart(2, "0")}`, label: `${MONTHS[m]} ${d.getUTCFullYear()}` };
    }
    const start = weekStart(t);
    const s = new Date(`${start}T00:00:00.000Z`);
    const e = new Date(s.getTime() + 6 * 86_400_000);
    const label =
        s.getUTCMonth() === e.getUTCMonth()
            ? `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`
            : `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
    return { key: start, label };
}

export function summarize(rows: TimingRow[]): Omit<TimingBucket, "key" | "label"> {
    const scored = rows.filter((r) => r.position !== null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const pos = scored.map((r) => r.position as number);
    return {
        n: rows.length,
        avgPosition: avg(pos),
        avgAboveLow: avg(scored.map((r) => r.aboveLow as number)),
        lowerThird: pos.filter((p) => p <= 100 / 3).length,
        best: pos.length ? Math.min(...pos) : null,
        worst: pos.length ? Math.max(...pos) : null,
    };
}

/** Rows grouped into calendar weeks (Mon–Sun, UTC), months or years, oldest first. */
export function groupTiming(rows: TimingRow[], period: TimingPeriod): (TimingBucket & { rows: TimingRow[] })[] {
    const map = new Map<string, { label: string; rows: TimingRow[] }>();
    for (const r of rows) {
        const b = bucketOf(r.t, period);
        const g = map.get(b.key) ?? { label: b.label, rows: [] };
        g.rows.push(r);
        map.set(b.key, g);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, g]) => ({ key, label: g.label, rows: g.rows, ...summarize(g.rows) }));
}
