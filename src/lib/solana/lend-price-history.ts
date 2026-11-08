import "server-only";
import type { PriceLevelHistory } from "./jupiter-lend";

/**
 * Daily candles for the collateral token (Binance public market data, no key)
 * → "when was the price last at the liquidation level?". Market data, not the
 * wallet's own — it only answers how far-fetched the liquidation price is.
 *
 * A day counts as "at the level" when its LOW touched it, since that is what a
 * liquidation would have needed. Candle times are UTC days.
 */
const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const DAY = 86400000;

export interface Candle {
    t: number; // open time, ms (UTC day)
    low: number;
}

/** Pure: last day with low ≤ level, and the lowest day of the last 12 months. */
export function analyzeCandles(candles: Candle[], level: number, symbol: string, now = Date.now()): PriceLevelHistory | null {
    if (!candles.length || !(level > 0)) return null;
    const sorted = [...candles].sort((a, b) => a.t - b.t);

    let last: Candle | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].low <= level) {
            last = sorted[i];
            break;
        }
    }
    let min: Candle | null = null;
    for (const c of sorted) {
        if (c.t >= now - 365 * DAY && (min == null || c.low < min.low)) min = c;
    }
    return {
        symbol,
        level,
        lastAtOrBelow: last ? { at: new Date(last.t).toISOString(), low: last.low, daysAgo: Math.floor((now - last.t) / DAY) } : null,
        min12m: min ? { at: new Date(min.t).toISOString(), low: min.low } : null,
        coverageFrom: new Date(sorted[0].t).toISOString(),
    };
}

async function fetchCandles(host: string, pair: string): Promise<Candle[]> {
    const out: Candle[] = [];
    let start = 0;
    for (let i = 0; i < 10; i++) {
        const res = await fetch(`${host}/api/v3/klines?symbol=${pair}&interval=1d&limit=1000&startTime=${start}`, {
            next: { revalidate: 3600 }, // daily candles — no need to refetch on every page view
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Binance ${res.status}`);
        const rows = (await res.json()) as unknown[][];
        if (!Array.isArray(rows) || rows.length === 0) break;
        for (const r of rows) out.push({ t: Number(r[0]), low: Number(r[3]) });
        if (rows.length < 1000) break;
        start = Number(rows[rows.length - 1][0]) + DAY;
    }
    return out;
}

/** Never throws: a failed lookup just means the "last seen" line is hidden. */
export async function getPriceLevelHistory(symbol: string, level: number | null): Promise<PriceLevelHistory | null> {
    if (level == null || !(level > 0)) return null;
    const pair = `${symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")}USDT`;
    for (const host of HOSTS) {
        try {
            const candles = await fetchCandles(host, pair);
            return analyzeCandles(candles, level, symbol);
        } catch (err) {
            console.warn(`[lend-price-history] ${host} ${pair}:`, (err as Error).message);
        }
    }
    return null;
}
