import "server-only";
import { db } from "@/lib/db";
import { DAY_MS, dayKey, planDays, refreshStart, type FetchedDay, type StoredDay } from "@/lib/price-history-plan";

/** One UTC day of price history. */
export interface DailyCandle {
    day: string; // yyyy-mm-dd (UTC)
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface SourceHistory {
    name: string; // "Coinbase" | "Binance"
    pair: string; // e.g. "SOL-USD", "SOLUSDT"
    candles: DailyCandle[];
    checkedAt: string | null; // last time this source was asked
    error: string | null; // last refresh failed (stored days are still returned)
    /** Closed days asked again after they were final, and how many of them came back changed. */
    accuracy: { last30: SourceAccuracy; all: SourceAccuracy };
}

export interface SourceAccuracy {
    checkedDays: number;
    correctedDays: number;
    pct: number | null; // share of re-checked days that needed no correction
}

function accuracyOf(rows: { rechecks: number; corrections: number }[]): SourceAccuracy {
    const checked = rows.filter((r) => r.rechecks > 0);
    const corrected = checked.filter((r) => r.corrections > 0).length;
    return { checkedDays: checked.length, correctedDays: corrected, pct: checked.length ? ((checked.length - corrected) / checked.length) * 100 : null };
}

export interface PriceCorrectionDTO {
    source: string;
    day: string;
    detectedAt: string;
    old: { open: number; high: number; low: number; close: number };
    new: { open: number; high: number; low: number; close: number };
}

export interface PriceHistory {
    sources: SourceHistory[];
    corrections: PriceCorrectionDTO[]; // last 30 days, newest first
}

/** Coinbase Exchange: [time(s), low, high, open, close, volume], newest first, at most 300 days per request. */
async function fromCoinbase(product: string, fromMs: number, toMs: number): Promise<FetchedDay[]> {
    const out: FetchedDay[] = [];
    for (let start = fromMs; start <= toMs; start += 300 * DAY_MS) {
        const end = Math.min(start + 299 * DAY_MS, toMs);
        const url = `https://api.exchange.coinbase.com/products/${product}/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
        const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "btcmanager" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`Coinbase a răspuns ${res.status}`);
        const rows = (await res.json()) as [number, number, number, number, number, number][];
        for (const [t, low, high, open, close] of rows) out.push({ day: dayKey(t * 1000), open, high, low, close });
    }
    return out;
}

/** Binance (public market-data host): [openTime(ms), open, high, low, close, …], oldest first, at most 1000 per request. */
async function fromBinance(symbol: string, fromMs: number, toMs: number): Promise<FetchedDay[]> {
    const out: FetchedDay[] = [];
    for (let start = fromMs; start <= toMs; start += 1000 * DAY_MS) {
        const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${start}&endTime=${toMs}&limit=1000`;
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`Binance a răspuns ${res.status}`);
        const rows = (await res.json()) as [number, string, string, string, string][];
        for (const [t, open, high, low, close] of rows) out.push({ day: dayKey(t), open: Number(open), high: Number(high), low: Number(low), close: Number(close) });
    }
    return out;
}

const SOURCES: Record<string, { name: string; pair: string; fetch: (fromMs: number, toMs: number) => Promise<FetchedDay[]> }[]> = {
    SOL: [
        { name: "Coinbase", pair: "SOL-USD", fetch: (a, b) => fromCoinbase("SOL-USD", a, b) },
        { name: "Binance", pair: "SOLUSDT", fetch: (a, b) => fromBinance("SOLUSDT", a, b) },
    ],
};

/**
 * Brings the stored days of every source up to date: downloads missing days since `fromDay` once, and every
 * 6 hours re-checks today and the last 3 closed days. Yesterday is closed at the daily 09:50 UTC check
 * (`dailyRun`, the cron); after that, a change to a closed day is saved as a correction. Each source is independent — one failing does not stop the other.
 * Returns the error of each source that failed (by name).
 */
export async function refreshDailyPrices(symbol: string, fromDay?: string, now = Date.now(), dailyRun = false): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};
    for (const src of SOURCES[symbol] ?? []) {
        try {
            const rows = await db.priceDaily.findMany({ where: { symbol, source: src.name }, orderBy: { day: "asc" } });
            const stored: StoredDay[] = rows.map((r) => ({
                day: dayKey(r.day.getTime()),
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                finalizedAt: r.finalizedAt?.getTime() ?? null,
                checkedAt: r.checkedAt.getTime(),
            }));
            // Without an explicit start (daily cron), keep checking from the first stored day.
            const from = fromDay ?? stored[0]?.day ?? dayKey(now - 3 * DAY_MS);
            const start = refreshStart(
                stored.filter((r) => r.day >= from),
                from,
                now,
                dailyRun,
            );
            if (!start) continue;

            const fetched = (await src.fetch(Date.parse(`${start}T00:00:00.000Z`), now)).filter((f) => f.day >= start);
            const checkedAt = new Date(now);
            for (const a of planDays(stored, fetched, now, dailyRun)) {
                const where = { symbol_source_day: { symbol, source: src.name, day: new Date(`${a.day}T00:00:00.000Z`) } };
                if (a.kind === "touch") {
                    await db.priceDaily.update({ where, data: { checkedAt, ...(a.recheck ? { rechecks: { increment: 1 } } : {}) } });
                } else if (a.kind === "create") {
                    await db.priceDaily.create({ data: { symbol, source: src.name, day: where.symbol_source_day.day, ...a.values, checkedAt, finalizedAt: a.finalize ? checkedAt : null } });
                } else if (a.kind === "update") {
                    await db.priceDaily.update({ where, data: { ...a.values, checkedAt, ...(a.finalize ? { finalizedAt: checkedAt } : {}) } });
                } else {
                    await db.$transaction([
                        db.priceCorrection.create({
                            data: {
                                symbol,
                                source: src.name,
                                day: where.symbol_source_day.day,
                                oldOpen: a.old.open,
                                oldHigh: a.old.high,
                                oldLow: a.old.low,
                                oldClose: a.old.close,
                                newOpen: a.values.open,
                                newHigh: a.values.high,
                                newLow: a.values.low,
                                newClose: a.values.close,
                            },
                        }),
                        db.priceDaily.update({ where, data: { ...a.values, checkedAt, rechecks: { increment: 1 }, corrections: { increment: 1 } } }),
                    ]);
                }
            }
        } catch (err) {
            errors[src.name] = err instanceof Error ? err.message : String(err);
            console.error(`refreshDailyPrices ${symbol}/${src.name} failed`, err);
        }
    }
    return errors;
}

/** Stored daily prices of every source since `fromDay` (refreshed first), plus the corrections of the last 30 days. */
export async function getPriceHistory(symbol: string, fromDay: string): Promise<PriceHistory | { error: string }> {
    try {
        const errors = await refreshDailyPrices(symbol, fromDay);
        const from = new Date(`${fromDay}T00:00:00.000Z`);
        const [rows, corrections] = await Promise.all([
            db.priceDaily.findMany({ where: { symbol, day: { gte: from } }, orderBy: { day: "asc" } }),
            db.priceCorrection.findMany({ where: { symbol, detectedAt: { gte: new Date(Date.now() - 30 * DAY_MS) } }, orderBy: { detectedAt: "desc" }, take: 50 }),
        ]);
        return {
            sources: (SOURCES[symbol] ?? []).map((src) => {
                const own = rows.filter((r) => r.source === src.name);
                const last = own.reduce<Date | null>((m, r) => (m === null || r.checkedAt > m ? r.checkedAt : m), null);
                return {
                    name: src.name,
                    pair: src.pair,
                    candles: own.map((r) => ({ day: dayKey(r.day.getTime()), open: r.open, high: r.high, low: r.low, close: r.close })),
                    checkedAt: last?.toISOString() ?? null,
                    error: errors[src.name] ?? null,
                    accuracy: { last30: accuracyOf(own.filter((r) => r.day.getTime() >= Date.now() - 30 * DAY_MS)), all: accuracyOf(own) },
                };
            }),
            corrections: corrections.map((c) => ({
                source: c.source,
                day: dayKey(c.day.getTime()),
                detectedAt: c.detectedAt.toISOString(),
                old: { open: c.oldOpen, high: c.oldHigh, low: c.oldLow, close: c.oldClose },
                new: { open: c.newOpen, high: c.newHigh, low: c.newLow, close: c.newClose },
            })),
        };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
