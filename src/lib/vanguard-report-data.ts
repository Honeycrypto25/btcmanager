import "server-only";
import { db } from "@/lib/db";

export interface VanguardTotalsSnapshot {
    invested: number;
    value: number;
    pnl: number;
    pnlPercent: number;
    accountCount: number;
}

export interface ValuePoint {
    date: string; // YYYY-MM-DD
    value: number;
}

/**
 * Session-independent Vanguard reads (native GBP figures) — for contexts
 * with no NextAuth session to scope by userId, currently just the
 * cron-triggered email reports (lib/email/send-report.ts). This app is
 * single-user, so "no userId filter" is equivalent to "this user's data",
 * the same convention getOverviewData() already uses for BTC/T212 (also
 * unfiltered). Deliberately separate from getVanguardTotals() /
 * getVanguardAccountValueHistory() in app/actions/vanguard.ts, which stay
 * session-gated since they're also reachable as client-invoked Server
 * Actions from the dashboard.
 *
 * Returns both the current totals AND the merged (all-accounts-summed)
 * total-value-over-time series in one query pass, since
 * lib/overview-evolution.ts needs both for the same email/report use case.
 */
export async function getVanguardReportData(provider?: string): Promise<{ totals: VanguardTotalsSnapshot; series: ValuePoint[] }> {
    const accounts = await db.vanguardAccount.findMany({
        where: provider ? { provider } : undefined,
        include: { holdings: { include: { priceHistory: { orderBy: { capturedAt: "asc" } } } } },
    });

    let invested = 0;
    let value = 0;
    const holdings: any[] = [];
    for (const acc of accounts as any[]) {
        for (const h of acc.holdings) {
            invested += Number(h.costBasis);
            value += Number(h.currentValue);
            holdings.push(h);
        }
    }
    const pnl = value - invested;
    const totals: VanguardTotalsSnapshot = {
        invested,
        value,
        pnl,
        pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
        accountCount: accounts.length,
    };

    // Same forward-fill reconstruction as getVanguardAccountValueHistory
    // (each holding's most-recently-known price at/before a date × its
    // CURRENT units), just summed straight across every holding from every
    // account instead of keeping a per-account breakdown, which the report
    // doesn't need.
    const allDates = new Set<string>();
    for (const h of holdings) {
        for (const p of h.priceHistory) allDates.add(p.capturedAt.toISOString().slice(0, 10));
    }
    const sortedDates = Array.from(allDates).sort();

    const series: ValuePoint[] = sortedDates.map((date) => {
        let total = 0;
        for (const h of holdings) {
            if (h.units === null) continue;
            let lastPrice: number | null = null;
            for (const p of h.priceHistory) {
                if (p.capturedAt.toISOString().slice(0, 10) <= date) {
                    lastPrice = Number(p.price);
                } else {
                    break;
                }
            }
            if (lastPrice !== null) total += lastPrice * Number(h.units);
        }
        return { date, value: total };
    });

    return { totals, series };
}
