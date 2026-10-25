import "server-only";
import { db } from "@/lib/db";

/**
 * Daily BTC/USD price history for the BTC charts.
 *
 * The charts used to call CoinGecko's free API straight from the browser,
 * which broke regularly: keyless rate limits (429), the free tier refusing
 * anything older than 365 days (the "ALL" range), and no fallback at all.
 *
 * Now the browser only ever talks to /api/btc/price-history, and this
 * module:
 *   1. serves from the BtcDailyPrice table when it already covers the range
 *      and today's price is less than an hour old;
 *   2. otherwise refreshes from the first provider that answers --
 *      Binance public data mirror -> Binance -> Kraken -> CoinGecko --
 *      and stores the result;
 *   3. if every provider fails, still returns whatever is stored, so the
 *      chart degrades to "slightly stale" instead of "Could not load".
 */

export interface DailyPrice {
    /** UTC midnight of the day, ms since epoch. */
    time: number;
    price: number;
}

type Fetched = { points: { date: string; price: number }[]; source: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 2000;
const TODAY_MAX_AGE_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

function dayKey(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider JSON shapes are validated where used
async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
    const res = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
}

/** Binance daily klines, paginated backwards 1000 days at a time. */
async function fromBinance(baseUrl: string, days: number, source: string): Promise<Fetched> {
    const points: { date: string; price: number }[] = [];
    let endTime: number | undefined;
    let remaining = days + 1;
    while (remaining > 0) {
        const limit = Math.min(1000, remaining);
        const url = `${baseUrl}/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${limit}${endTime ? `&endTime=${endTime}` : ""}`;
        const rows = (await getJson(url)) as [number, string, string, string, string][];
        if (!Array.isArray(rows) || rows.length === 0) break;
        for (const r of rows) points.push({ date: dayKey(Number(r[0])), price: parseFloat(r[4]) });
        remaining -= rows.length;
        endTime = Number(rows[0][0]) - 1;
        if (rows.length < limit) break;
    }
    return { points, source };
}

/** Kraken daily OHLC -- returns up to the last 720 days. */
async function fromKraken(): Promise<Fetched> {
    const data = await getJson("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440");
    if (data.error?.length) throw new Error(data.error[0]);
    const key = Object.keys(data.result).find((k) => k !== "last");
    const rows = key ? (data.result[key] as [number, string, string, string, string][]) : [];
    return {
        points: rows.map((r) => ({ date: dayKey(Number(r[0]) * 1000), price: parseFloat(r[4]) })),
        source: "kraken",
    };
}

/** CoinGecko -- the free/demo tier only serves the last 365 days. */
async function fromCoinGecko(days: number): Promise<Fetched> {
    const apiKey = process.env.COINGECKO_API_KEY;
    const capped = Math.min(days, 365);
    const data = await getJson(
        `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${capped}&interval=daily`,
        apiKey ? { "x-cg-demo-api-key": apiKey } : undefined
    );
    const byDay = new Map<string, number>();
    for (const [ts, price] of data.prices as [number, number][]) byDay.set(dayKey(ts), price);
    return { points: Array.from(byDay, ([date, price]) => ({ date, price })), source: "coingecko" };
}

async function fetchFromProviders(days: number): Promise<Fetched | null> {
    const providers: (() => Promise<Fetched>)[] = [
        () => fromBinance("https://data-api.binance.vision", days, "binance-data"),
        () => fromBinance("https://api.binance.com", days, "binance"),
        () => fromKraken(),
        () => fromCoinGecko(days),
    ];
    for (const provider of providers) {
        try {
            const result = await provider();
            const valid = result.points.filter((p) => Number.isFinite(p.price) && p.price > 0);
            if (valid.length > 0) return { points: valid, source: result.source };
        } catch (err) {
            console.warn("[btc-price-history] provider failed:", (err as Error).message);
        }
    }
    return null;
}

async function store(fetched: Fetched) {
    const today = dayKey(Date.now());
    const recentCutoff = dayKey(Date.now() - 3 * DAY_MS);
    // Older days are final -- insert once, never rewrite. The last few days
    // (today's candle is still moving) are overwritten with fresh values.
    await db.btcDailyPrice.createMany({
        data: fetched.points.map((p) => ({ date: p.date, priceUsd: p.price, source: fetched.source })),
        skipDuplicates: true,
    });
    const recent = fetched.points.filter((p) => p.date >= recentCutoff && p.date <= today);
    for (const p of recent) {
        await db.btcDailyPrice.update({
            where: { date: p.date },
            data: { priceUsd: p.price, source: fetched.source },
        });
    }
}

// Don't hammer providers when a range simply can't be covered (e.g. a
// range older than any provider serves): one refresh attempt per range
// per 10 minutes per server instance.
const lastAttempt = new Map<number, number>();

export async function getBtcDailyPrices(daysRequested: number): Promise<{ prices: DailyPrice[]; stale: boolean }> {
    const days = Math.max(1, Math.min(MAX_DAYS, Math.ceil(daysRequested)));
    const startKey = dayKey(Date.now() - days * DAY_MS);
    const todayKey = dayKey(Date.now());

    const read = async () =>
        (await db.btcDailyPrice.findMany({ where: { date: { gte: startKey } }, orderBy: { date: "asc" } })) as { date: string; priceUsd: number; updatedAt: Date }[];

    let rows = await read();
    const todayRow = rows.find((r) => r.date === todayKey);
    const todayFresh = !!todayRow && Date.now() - new Date(todayRow.updatedAt).getTime() < TODAY_MAX_AGE_MS;
    // Allow a couple of days of slack at the start (weekends/holidays don't
    // exist for BTC, but a provider's window may start a day late).
    const covered = rows.length > 0 && rows[0].date <= dayKey(Date.now() - (days - 2) * DAY_MS);

    let stale = false;
    if (!todayFresh || !covered) {
        const last = lastAttempt.get(days) ?? 0;
        const canTry = todayFresh ? Date.now() - last > 10 * 60 * 1000 : true;
        if (canTry) {
            lastAttempt.set(days, Date.now());
            const fetched = await fetchFromProviders(days);
            if (fetched) {
                try {
                    await store(fetched);
                    rows = await read();
                } catch (err) {
                    console.error("[btc-price-history] store failed:", err);
                    // Serve the fresh data even if the DB write failed.
                    const fresh = fetched.points.filter((p) => p.date >= startKey).sort((a, b) => a.date.localeCompare(b.date));
                    return {
                        prices: fresh.map((p) => ({ time: Date.parse(`${p.date}T00:00:00Z`), price: p.price })),
                        stale: false,
                    };
                }
            } else {
                stale = true;
            }
        }
    }

    return {
        prices: rows.map((r) => ({ time: Date.parse(`${r.date}T00:00:00Z`), price: Number(r.priceUsd) })),
        stale,
    };
}
