import "server-only";
import { db } from "@/lib/db";
import { getCurrentBtcPrice, getPriceHistory } from "@/lib/btc";
import { getVanguardAccountValueHistory } from "@/app/actions/vanguard";

/**
 * "How has this asset's total value moved over the last 30 days / 6 months /
 * 1 year" — a point-in-time comparison (value now vs. value back then),
 * NOT the cost-basis "return on money invested in that window" metric that
 * TrailingPeriodsCard already shows further down the page. The two can
 * legitimately disagree (e.g. a fresh purchase can make the 30-day figure
 * here look flat even if the underlying asset moved a lot), and that's
 * expected — they're answering different questions.
 *
 * Each window is `null` when there isn't enough history to answer it yet
 * (e.g. the wallet/account/holding didn't exist that far back), rather than
 * showing a misleading 0% or -100%.
 */
export interface AssetEvolution {
    d30: number | null;
    m6: number | null;
    y1: number | null;
}

export interface ValuePoint {
    date: string; // YYYY-MM-DD
    value: number;
}

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}
function monthsAgo(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
}
function yearsAgo(n: number): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d;
}

function percentChange(then: number, now: number): number | null {
    if (then <= 0) return null;
    return ((now - then) / then) * 100;
}

/**
 * BTC: reconstructs the exact amount held as of a past date straight from
 * the transaction log, and prices it using Binance's daily BTC/USDT candles
 * (getPriceHistory, already used elsewhere for the BTC price chart) — the
 * closest close at or before that date. 400 daily candles comfortably
 * covers the 1-year window with room to spare.
 */
export async function getBtcEvolution(): Promise<AssetEvolution> {
    try {
        const [currentPrice, wallets, candles] = await Promise.all([
            getCurrentBtcPrice(),
            db.bitcoinWallet.findMany({ include: { transactions: true } }),
            getPriceHistory("1d", 400),
        ]);
        const txs = (wallets as any[]).flatMap((w) => w.transactions) as { amount: number; timestamp: Date | string }[];
        const currentAmount = txs.reduce((s, t) => s + t.amount, 0);
        const currentValue = currentAmount * currentPrice;

        const closestPriceAt = (target: Date): number | null => {
            if (!candles || candles.length === 0) return null;
            const targetMs = target.getTime();
            let best: { time: number; close: number } | null = null;
            for (const c of candles) {
                if (c.time <= targetMs && (!best || c.time > best.time)) best = c;
            }
            return best ? best.close : null;
        };

        const valueAsOf = (target: Date): number | null => {
            const price = closestPriceAt(target);
            if (price === null) return null;
            const amount = txs
                .filter((t) => new Date(t.timestamp).getTime() <= target.getTime())
                .reduce((s, t) => s + t.amount, 0);
            if (amount <= 0) return null;
            return amount * price;
        };

        const d30Then = valueAsOf(daysAgo(30));
        const m6Then = valueAsOf(monthsAgo(6));
        const y1Then = valueAsOf(yearsAgo(1));

        return {
            d30: d30Then !== null ? percentChange(d30Then, currentValue) : null,
            m6: m6Then !== null ? percentChange(m6Then, currentValue) : null,
            y1: y1Then !== null ? percentChange(y1Then, currentValue) : null,
        };
    } catch {
        return { d30: null, m6: null, y1: null };
    }
}

/**
 * Trading 212: uses the T212Snapshot history that the daily sync already
 * accumulates (same table the page reads the "latest" snapshot from) — no
 * new data source needed. Converts using the CURRENT GBP->USD rate for
 * every past snapshot too, same simplification already used everywhere
 * else in overview-data.ts (historical entries don't use the FX rate on
 * their own date).
 */
export async function getT212Evolution(gbpToUsd: number): Promise<AssetEvolution> {
    try {
        const account = await db.t212Account.findFirst();
        if (!account) return { d30: null, m6: null, y1: null };

        const snapshots = await db.t212Snapshot.findMany({
            where: { accountId: account.id },
            orderBy: { capturedAt: "asc" },
        });
        if (snapshots.length === 0) return { d30: null, m6: null, y1: null };

        const latest = snapshots[snapshots.length - 1];
        const currentValueUsd = latest.totalValue * gbpToUsd;

        const closestAtOrBefore = (target: Date) => {
            const targetMs = target.getTime();
            let best: (typeof snapshots)[number] | null = null;
            for (const s of snapshots) {
                const t = new Date(s.capturedAt).getTime();
                if (t <= targetMs && (!best || t > new Date(best.capturedAt).getTime())) best = s;
            }
            return best;
        };

        const percentAt = (target: Date): number | null => {
            const snap = closestAtOrBefore(target);
            if (!snap) return null;
            return percentChange(snap.totalValue * gbpToUsd, currentValueUsd);
        };

        return { d30: percentAt(daysAgo(30)), m6: percentAt(monthsAgo(6)), y1: percentAt(yearsAgo(1)) };
    } catch {
        return { d30: null, m6: null, y1: null };
    }
}

/** Merges every Vanguard account's forward-filled value history
 * (getVanguardAccountValueHistory, already used by /vanguard's Statistici
 * tab) into a single total-portfolio-value-over-time series, in USD. */
async function getVanguardTotalSeries(gbpToUsd: number): Promise<ValuePoint[]> {
    const perAccount = await getVanguardAccountValueHistory();
    const byDate = new Map<string, number>();
    for (const series of perAccount) {
        for (const p of series.points) {
            byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value);
        }
    }
    return Array.from(byDate.entries())
        .map(([date, value]) => ({ date, value: value * gbpToUsd }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Vanguard: same "value now vs. value back then" idea as BTC/T212 above,
 * built from VanguardPriceHistory instead of a klines API or account
 * snapshots. Since price history only started accumulating recently (and
 * OEIC funds price once a day at best), most windows will read `null` for
 * a while — same "not enough data yet" story as the per-holding evolution
 * chart on /vanguard, not a bug.
 */
export async function getVanguardEvolution(gbpToUsd: number): Promise<{ evolution: AssetEvolution; series: ValuePoint[] }> {
    try {
        const points = await getVanguardTotalSeries(gbpToUsd);
        if (points.length === 0) return { evolution: { d30: null, m6: null, y1: null }, series: [] };

        const currentValue = points[points.length - 1].value;

        const closestAtOrBefore = (target: Date): ValuePoint | null => {
            const targetKey = target.toISOString().slice(0, 10);
            let best: ValuePoint | null = null;
            for (const p of points) {
                if (p.date <= targetKey && (!best || p.date > best.date)) best = p;
            }
            return best;
        };

        const percentAt = (target: Date): number | null => {
            const p = closestAtOrBefore(target);
            if (!p) return null;
            return percentChange(p.value, currentValue);
        };

        return {
            evolution: { d30: percentAt(daysAgo(30)), m6: percentAt(monthsAgo(6)), y1: percentAt(yearsAgo(1)) },
            series: points,
        };
    } catch {
        return { evolution: { d30: null, m6: null, y1: null }, series: [] };
    }
}
