import "server-only";
import { db } from "@/lib/db";

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// 1inch free plan: 100k requests per plan cycle; the cycle of this account starts on the 21st.
const ONEINCH_LIMIT = Number(process.env.ONEINCH_MONTHLY_LIMIT) || 100_000;
const ONEINCH_CYCLE_START_DAY = Number(process.env.ONEINCH_CYCLE_START_DAY) || 21;
// Alchemy free plan: 30M compute units per calendar month (UTC).
const ALCHEMY_LIMIT = Number(process.env.ALCHEMY_MONTHLY_CU_LIMIT) || 30_000_000;

export interface UsageDay {
    day: string; // yyyy-mm-dd (UTC)
    total: number;
    parts: Record<string, number>; // series name → requests
}

export interface CountedUsage {
    days: UsageDay[]; // last 30 days, oldest first
    series: string[];
    today: number;
    last7: number;
    last30: number;
    limited30: number; // HTTP 429 responses
    errors30: number;
    countedSince: string | null; // first day the platform counted anything
    monthlyPace: number; // average of the last 7 counted days × 30
}

export interface ApiUsageReport {
    generatedAt: string;
    oneinch: CountedUsage & { limit: number; cycleStart: string; cycleEnd: string; cycleTotal: number; byChain: Record<string, number> };
    jupiter: CountedUsage;
    alchemy: {
        configured: boolean;
        error: string | null;
        days: { day: string; cu: number }[];
        monthTotal: number;
        limit: number;
        monthlyPace: number;
    };
}

const CHAIN_NAMES: Record<string, string> = { "8453": "Base", "56": "BNB", "137": "Polygon", "1": "Ethereum" };
const ONEINCH_PRODUCTS: Record<string, string> = { swap: "Swap API", orderbook: "Orderbook API" };

type Row = { provider: string; bucket: string; day: Date; count: number; limited: number; errors: number };

function summarize(rows: Row[], now: Date, seriesOf: (bucket: string) => string, firstDay: Date | null): CountedUsage {
    const byDay = new Map<string, UsageDay>();
    for (let i = 29; i >= 0; i--) {
        const key = dayKey(new Date(now.getTime() - i * DAY));
        byDay.set(key, { day: key, total: 0, parts: {} });
    }
    const series = new Set<string>();
    let limited30 = 0;
    let errors30 = 0;
    for (const r of rows) {
        const d = byDay.get(dayKey(r.day));
        if (!d) continue;
        const name = seriesOf(r.bucket);
        series.add(name);
        d.total += r.count;
        d.parts[name] = (d.parts[name] ?? 0) + r.count;
        limited30 += r.limited;
        errors30 += r.errors;
    }
    const days = [...byDay.values()];
    const sum = (list: UsageDay[]) => list.reduce((a, d) => a + d.total, 0);
    const countedSince = firstDay ? dayKey(firstDay) : null;
    // Pace from full counted days only (today is partial, days before counting started are empty).
    const full = days.slice(0, -1).filter((d) => countedSince !== null && d.day >= countedSince).slice(-7);
    const paceBase = full.length ? full : days.slice(-1);
    return {
        days,
        series: [...series].sort(),
        today: days[days.length - 1].total,
        last7: sum(days.slice(-7)),
        last30: sum(days),
        limited30,
        errors30,
        countedSince,
        monthlyPace: Math.round((sum(paceBase) / paceBase.length) * 30),
    };
}

function oneInchCycle(now: Date): { start: Date; end: Date } {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const start = now.getUTCDate() >= ONEINCH_CYCLE_START_DAY ? new Date(Date.UTC(y, m, ONEINCH_CYCLE_START_DAY)) : new Date(Date.UTC(y, m - 1, ONEINCH_CYCLE_START_DAY));
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, ONEINCH_CYCLE_START_DAY));
    return { start, end: new Date(next.getTime() - DAY) };
}

/** Official compute-unit usage from Alchemy's Admin API (needs ALCHEMY_ACCESS_KEY — an access key, not the app API key). */
async function loadAlchemy(now: Date): Promise<ApiUsageReport["alchemy"]> {
    const base = { configured: false, error: null as string | null, days: [] as { day: string; cu: number }[], monthTotal: 0, limit: ALCHEMY_LIMIT, monthlyPace: 0 };
    const key = process.env.ALCHEMY_ACCESS_KEY;
    if (!key) return base;
    try {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const res = await fetch("https://admin-api.alchemy.com/v1/usage/time-series", {
            method: "POST",
            headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
            body: JSON.stringify({ startTime: monthStart.toISOString(), granularity: "day" }),
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text();
        if (!res.ok) return { ...base, configured: true, error: `Alchemy a răspuns ${res.status}: ${text.slice(0, 200)}` };
        const json = JSON.parse(text) as { data?: { data?: { startTime: string; amount: string }[] } };
        const days = (json.data?.data ?? []).map((b) => ({ day: b.startTime.slice(0, 10), cu: Number(b.amount) || 0 })).sort((a, b) => a.day.localeCompare(b.day));
        const monthTotal = days.reduce((a, d) => a + d.cu, 0);
        const full = days.filter((d) => d.day < dayKey(now)).slice(-7);
        const monthlyPace = full.length ? Math.round((full.reduce((a, d) => a + d.cu, 0) / full.length) * 30) : 0;
        return { configured: true, error: null, days, monthTotal, limit: ALCHEMY_LIMIT, monthlyPace };
    } catch (err) {
        return { ...base, configured: true, error: err instanceof Error ? err.message : String(err) };
    }
}

export async function getApiUsageReport(): Promise<ApiUsageReport> {
    const now = new Date();
    const cycle = oneInchCycle(now);
    const from = new Date(Math.min(now.getTime() - 30 * DAY, cycle.start.getTime()));
    const [rows, firsts, alchemy] = await Promise.all([
        db.apiUsageDaily.findMany({ where: { day: { gte: from } }, orderBy: { day: "asc" } }),
        db.apiUsageDaily.groupBy({ by: ["provider"], _min: { day: true } }),
        loadAlchemy(now),
    ]);
    const first = (p: string) => firsts.find((f) => f.provider === p)?._min.day ?? null;
    const oneinchRows = rows.filter((r) => r.provider === "1inch");
    const jupiterRows = rows.filter((r) => r.provider === "jupiter");

    const byChain: Record<string, number> = {};
    let cycleTotal = 0;
    for (const r of oneinchRows) {
        if (r.day.getTime() < cycle.start.getTime()) continue;
        cycleTotal += r.count;
        const chainId = r.bucket.split(":")[1];
        const name = chainId ? (CHAIN_NAMES[chainId] ?? `chain ${chainId}`) : "altele";
        byChain[name] = (byChain[name] ?? 0) + r.count;
    }

    return {
        generatedAt: now.toISOString(),
        oneinch: {
            ...summarize(oneinchRows, now, (b) => ONEINCH_PRODUCTS[b.split(":")[0]] ?? b.split(":")[0], first("1inch")),
            limit: ONEINCH_LIMIT,
            cycleStart: dayKey(cycle.start),
            cycleEnd: dayKey(cycle.end),
            cycleTotal,
            byChain,
        },
        jupiter: summarize(jupiterRows, now, (b) => b, first("jupiter")),
        alchemy,
    };
}
