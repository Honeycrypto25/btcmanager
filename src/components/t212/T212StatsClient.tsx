"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
    ComposedChart,
    Area,
    Line,
    Bar,
    BarChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell,
    LabelList,
} from "recharts";
import { format, differenceInCalendarMonths, startOfWeek } from "date-fns";
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, PiggyBank, Percent } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";

interface SnapshotDTO {
    capturedAt: string;
    totalValue: number;
    investedValue: number;
    freeCash: number;
    resultPpl: number;
}

interface OrderDTO {
    filledAt: string;
    side: string;
    total: number;
    realizedProfit: number | null;
    ticker: string;
    name: string;
}

interface AccountDTO {
    currency: string | null;
    environment: string;
}

const PERIOD_OPTIONS = [
    { key: "3m", label: "3L", months: 3 },
    { key: "6m", label: "6L", months: 6 },
    { key: "1y", label: "1A", months: 12 },
    { key: "all", label: "Tot", months: null },
] as const;

type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];

// Cap how many bars/points a chart draws — at "Zilnic" granularity over
// months of history, cramming 40+ daily bars into one card just turns into
// unreadable slivers. Keeps the MOST RECENT points, since that's what you
// care about seeing clearly; switch to a coarser granularity (or a shorter
// period) to see further back without truncation.
const MAX_CHART_POINTS = 20;

function capToRecent<T>(series: T[]): { data: T[]; truncated: boolean } {
    if (series.length <= MAX_CHART_POINTS) return { data: series, truncated: false };
    return { data: series.slice(series.length - MAX_CHART_POINTS), truncated: true };
}

const GRANULARITY_OPTIONS = [
    { key: "day", label: "Zilnic" },
    { key: "week", label: "Săptămânal" },
    { key: "month", label: "Lunar" },
    { key: "year", label: "Anual" },
] as const;

type Granularity = (typeof GRANULARITY_OPTIONS)[number]["key"];

/** Groups a date into the bucket key for the chosen granularity — same key for every date in that day/week/month/year, so the LAST snapshot per bucket can be picked as its representative point. */
function bucketKey(date: Date, g: Granularity): string {
    if (g === "day") return format(date, "yyyy-MM-dd");
    if (g === "week") return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
    if (g === "month") return format(date, "yyyy-MM");
    return format(date, "yyyy");
}

function bucketLabel(date: Date, g: Granularity): string {
    if (g === "day") return format(date, "d MMM");
    if (g === "week") return `S ${format(startOfWeek(date, { weekStartsOn: 1 }), "d MMM")}`;
    if (g === "month") return format(date, "MMM yyyy");
    return format(date, "yyyy");
}

export function T212StatsClient({
    account,
    snapshots,
    orders,
}: {
    account: AccountDTO | null;
    snapshots: SnapshotDTO[];
    orders: OrderDTO[];
}) {
    const [period, setPeriod] = useState<PeriodKey>("all");
    const [granularity, setGranularity] = useState<Granularity>("day");

    const currencySymbol =
        account?.currency === "USD" ? "$" : account?.currency === "EUR" ? "€" : account?.currency === "GBP" ? "£" : account?.currency ? `${account.currency} ` : "£";
    const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    // One snapshot per calendar day (last sync of the day wins) — several
    // manual "Sync now" clicks on the same day would otherwise create noisy
    // duplicate points on the evolution charts.
    const dailySnapshots = useMemo(() => {
        const byDay = new Map<string, SnapshotDTO>();
        for (const s of snapshots) {
            const key = format(new Date(s.capturedAt), "yyyy-MM-dd");
            byDay.set(key, s); // snapshots arrive sorted ascending, so the last write per day is the latest
        }
        return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, s]) => ({ day, ...s }));
    }, [snapshots]);

    const periodCutoff = useMemo(() => {
        const opt = PERIOD_OPTIONS.find((o) => o.key === period);
        if (!opt?.months) return null;
        const d = new Date();
        d.setMonth(d.getMonth() - opt.months);
        return d;
    }, [period]);

    const filteredDailySnapshots = useMemo(() => {
        if (!periodCutoff) return dailySnapshots;
        return dailySnapshots.filter((s) => new Date(s.capturedAt) >= periodCutoff);
    }, [dailySnapshots, periodCutoff]);

    // The evolution charts group snapshots by the chosen granularity, keeping
    // only the LAST snapshot in each day/week/month/year bucket — right for
    // point-in-time balances like these (total value, invested, P&L), as
    // opposed to summing, which would only make sense for flow amounts.
    const aggregatedSnapshots = useMemo(() => {
        const byBucket = new Map<string, { key: string; label: string; s: (typeof filteredDailySnapshots)[number] }>();
        for (const s of filteredDailySnapshots) {
            const d = new Date(s.capturedAt);
            const key = bucketKey(d, granularity);
            byBucket.set(key, { key, label: bucketLabel(d, granularity), s });
        }
        return [...byBucket.values()].sort((a, b) => a.key.localeCompare(b.key));
    }, [filteredDailySnapshots, granularity]);

    const portfolioSeries = useMemo(
        () =>
            aggregatedSnapshots.map(({ label, s }) => ({
                date: label,
                "Valoare totală": Math.round(s.totalValue * 100) / 100,
                Investit: Math.round(s.investedValue * 100) / 100,
            })),
        [aggregatedSnapshots]
    );

    const pnlSeries = useMemo(
        () =>
            aggregatedSnapshots.map(({ label, s }) => ({
                date: label,
                pnl: Math.round(s.resultPpl * 100) / 100,
                pnlPercent: s.investedValue > 0 ? Math.round((s.resultPpl / s.investedValue) * 10000) / 100 : 0,
            })),
        [aggregatedSnapshots]
    );

    const buyOrders = useMemo(() => orders.filter((o) => o.side === "BUY"), [orders]);
    const sellOrders = useMemo(() => orders.filter((o) => o.side === "SELL"), [orders]);

    const totalBoughtEver = useMemo(() => buyOrders.reduce((sum, o) => sum + o.total, 0), [buyOrders]);
    const realizedPnl = useMemo(() => sellOrders.reduce((sum, o) => sum + (o.realizedProfit ?? 0), 0), [sellOrders]);
    const soldValue = useMemo(() => sellOrders.reduce((sum, o) => sum + o.total, 0), [sellOrders]);
    const soldCostBasis = soldValue - realizedPnl;
    const realizedReturnPercent = soldCostBasis > 0 ? (realizedPnl / soldCostBasis) * 100 : 0;

    const latest = dailySnapshots[dailySnapshots.length - 1];
    const totalValueNow = latest?.totalValue ?? 0;
    const investedNow = latest?.investedValue ?? 0;
    const unrealizedPnl = latest?.resultPpl ?? 0;
    const unrealizedPercent = investedNow > 0 ? (unrealizedPnl / investedNow) * 100 : 0;

    // Overall ROI, per the definition chosen for this page: total P&L (realized
    // + unrealized) against the FULL capital ever put in — not just the cost
    // basis of what's still open, which would inflate ROI every time something
    // profitable gets sold and the "invested" denominator shrinks.
    const totalPnl = unrealizedPnl + realizedPnl;
    const overallRoiPercent = totalBoughtEver > 0 ? (totalPnl / totalBoughtEver) * 100 : 0;

    const avgMonthlyInvestment = useMemo(() => {
        if (buyOrders.length === 0) return 0;
        const first = new Date(buyOrders[0].filledAt);
        const last = new Date(buyOrders[buyOrders.length - 1].filledAt);
        const monthSpan = Math.max(1, differenceInCalendarMonths(last, first) + 1);
        return totalBoughtEver / monthSpan;
    }, [buyOrders, totalBoughtEver]);

    // Same period filter as the evolution charts above — respects `period` so
    // switching to "3L"/"6L"/"1A" narrows every chart on the page, not just
    // the first two.
    const filteredBuyOrders = useMemo(() => {
        if (!periodCutoff) return buyOrders;
        return buyOrders.filter((o) => new Date(o.filledAt) >= periodCutoff);
    }, [buyOrders, periodCutoff]);

    // Investment is a FLOW amount (money going in during the bucket), so
    // buckets are summed — unlike the point-in-time balances above, which
    // take the last value in the bucket.
    const investmentSeries = useMemo(() => {
        const byBucket = new Map<string, { key: string; label: string; total: number }>();
        for (const o of filteredBuyOrders) {
            const d = new Date(o.filledAt);
            const key = bucketKey(d, granularity);
            const existing = byBucket.get(key) ?? { key, label: bucketLabel(d, granularity), total: 0 };
            existing.total += o.total;
            byBucket.set(key, existing);
        }
        return [...byBucket.values()].sort((a, b) => a.key.localeCompare(b.key));
    }, [filteredBuyOrders, granularity]);

    // "ROI (cumulativ)" here means: the cumulative ROI (total unrealized P&L
    // over total invested capital, at that point in time) observed at the end
    // of each bucket — a running temperature check, not a delta. With money
    // going in continuously via auto-invest, a clean per-bucket delta isn't
    // really separable from new contributions without misleading
    // assumptions, so this progression is the honest way to show "how is the
    // ROI trending" over time. Reuses aggregatedSnapshots so it shares both
    // the period filter and the granularity toggle with the charts above.
    const roiSeries = useMemo(
        () =>
            aggregatedSnapshots.map(({ label, s }) => ({
                label,
                roi: s.investedValue > 0 ? Math.round((s.resultPpl / s.investedValue) * 10000) / 100 : 0,
            })),
        [aggregatedSnapshots]
    );

    // Each chart is capped independently to its own most-recent MAX_CHART_POINTS.
    const portfolioChart = useMemo(() => capToRecent(portfolioSeries), [portfolioSeries]);
    const pnlChart = useMemo(() => capToRecent(pnlSeries), [pnlSeries]);
    const investmentChart = useMemo(() => capToRecent(investmentSeries), [investmentSeries]);
    const roiChart = useMemo(() => capToRecent(roiSeries), [roiSeries]);

    // Best/worst month by £ swing in unrealized P&L, month-over-month — a
    // quick "which month felt best/worst" callout, separate from the ROI %
    // progression above.
    const { bestMonth, worstMonth } = useMemo(() => {
        const byMonth = new Map<string, { key: string; label: string; pnl: number }>();
        for (const s of dailySnapshots) {
            const d = new Date(s.capturedAt);
            const key = format(d, "yyyy-MM");
            byMonth.set(key, { key, label: format(d, "MMM yyyy"), pnl: s.resultPpl });
        }
        const monthsSorted = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
        const deltas = monthsSorted.map((m, i) => ({
            label: m.label,
            delta: i === 0 ? m.pnl : m.pnl - monthsSorted[i - 1].pnl,
        }));
        if (deltas.length === 0) return { bestMonth: null, worstMonth: null };
        const best = deltas.reduce((a, b) => (b.delta > a.delta ? b : a));
        const worst = deltas.reduce((a, b) => (b.delta < a.delta ? b : a));
        return { bestMonth: best, worstMonth: worst };
    }, [dailySnapshots]);

    if (!account || dailySnapshots.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <Link href="/t212">
                        <Button variant="ghost" size="icon" aria-label="Înapoi">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Statistici Trading 212</h1>
                </div>
                <Card>
                    <p className="text-sm text-muted py-8 text-center">Nu există încă destule sincronizări pentru a genera statistici.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link href="/t212">
                        <Button variant="ghost" size="icon" aria-label="Înapoi">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Statistici Trading 212</h1>
                        <p className="text-muted text-sm">{dailySnapshots.length} sincronizări zilnice · {orders.length} ordine</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-white/[0.02] p-1">
                    {PERIOD_OPTIONS.map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => setPeriod(opt.key)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                period === opt.key ? "bg-primary/15 text-primary" : "text-muted hover:text-foreground"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Valoare totală</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(totalValueNow)}</h2>
                    <p className="text-xs text-faint mt-1">Investit acum: {fmt(investedNow)}</p>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">P&amp;L nerealizat</p>
                    <div className="flex items-center gap-2">
                        <h2 className={cn("text-2xl font-medium font-num", unrealizedPnl >= 0 ? "text-accent" : "text-red-400")}>
                            {unrealizedPnl >= 0 ? "+" : ""}{fmt(unrealizedPnl)}
                        </h2>
                        {unrealizedPnl >= 0 ? <TrendingUp className="w-4 h-4 text-accent" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </div>
                    <p className={cn("text-xs font-num mt-1", unrealizedPnl >= 0 ? "text-accent/80" : "text-red-400/80")}>{unrealizedPercent.toFixed(2)}%</p>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">P&amp;L realizat (vânzări)</p>
                    <h2 className={cn("text-2xl font-medium font-num", realizedPnl >= 0 ? "text-accent" : "text-red-400")}>
                        {realizedPnl >= 0 ? "+" : ""}{fmt(realizedPnl)}
                    </h2>
                    <p className={cn("text-xs font-num mt-1", realizedReturnPercent >= 0 ? "text-accent/80" : "text-red-400/80")}>
                        {realizedReturnPercent.toFixed(2)}% · {sellOrders.length} vânzări
                    </p>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">ROI general</p>
                    <h2 className={cn("text-2xl font-medium font-num", overallRoiPercent >= 0 ? "text-accent" : "text-red-400")}>
                        {overallRoiPercent >= 0 ? "+" : ""}{overallRoiPercent.toFixed(2)}%
                    </h2>
                    <p className="text-xs text-faint mt-1">P&amp;L total / {fmt(totalBoughtEver)} investit vreodată</p>
                </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <PiggyBank className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium text-muted uppercase tracking-wider">Medie investiție lunară</p>
                        <p className="text-lg font-medium font-num text-foreground truncate">{fmt(avgMonthlyInvestment)}</p>
                    </div>
                </Card>
                <Card className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                        <Calendar className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium text-muted uppercase tracking-wider">Cea mai bună lună</p>
                        <p className="text-lg font-medium font-num text-accent truncate">
                            {bestMonth ? `+${fmt(bestMonth.delta)}` : "—"}
                        </p>
                        <p className="text-xs text-faint">{bestMonth?.label ?? "—"}</p>
                    </div>
                </Card>
                <Card className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                        <Percent className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium text-muted uppercase tracking-wider">Cea mai slabă lună</p>
                        <p className="text-lg font-medium font-num text-red-400 truncate">
                            {worstMonth ? `${worstMonth.delta >= 0 ? "+" : ""}${fmt(worstMonth.delta)}` : "—"}
                        </p>
                        <p className="text-xs text-faint">{worstMonth?.label ?? "—"}</p>
                    </div>
                </Card>
            </div>

            {/* Granularity toggle — shared by all four charts below (portfolio,
                P&L, investment, ROI); the period buttons up in the header
                filter them too. */}
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-muted uppercase tracking-wider">Granularitate grafice:</span>
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-white/[0.02] p-1">
                    {GRANULARITY_OPTIONS.map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => setGranularity(opt.key)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                granularity === opt.key ? "bg-primary/15 text-primary" : "text-muted hover:text-foreground"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Portfolio evolution */}
            <Card>
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="text-sm font-medium text-foreground">Evoluție portofoliu — valoare totală vs. investit</h2>
                    {portfolioChart.truncated && (
                        <span className="text-[11px] text-faint shrink-0">ultimele {MAX_CHART_POINTS} din {portfolioSeries.length}</span>
                    )}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={portfolioChart.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" domain={["auto", "auto"]} />
                        <Tooltip
                            contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                            formatter={(v) => fmt(Number(v))}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="Valoare totală" stroke="#8b5cf6" fill="rgba(139,92,246,0.15)" strokeWidth={2} />
                        <Line type="monotone" dataKey="Investit" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </Card>

            {/* P&L evolution */}
            <Card>
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="text-sm font-medium text-foreground">Evoluție profitabilitate (P&amp;L nerealizat)</h2>
                    {pnlChart.truncated && <span className="text-[11px] text-faint shrink-0">ultimele {MAX_CHART_POINTS} din {pnlSeries.length}</span>}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={pnlChart.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" unit="%" />
                        <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line yAxisId="left" type="monotone" dataKey="pnl" name={`P&L (${currencySymbol})`} stroke="#22c55e" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="pnlPercent" name="P&L (%)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </Card>

            {/* Investment per bucket — own full-width row, not squeezed into a
                2-column grid, so bars stay readable even at "Zilnic". */}
            <Card>
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="text-sm font-medium text-foreground">Investiție</h2>
                    {investmentChart.truncated && (
                        <span className="text-[11px] text-faint shrink-0">ultimele {MAX_CHART_POINTS} din {investmentSeries.length}</span>
                    )}
                </div>
                {investmentChart.data.length === 0 ? (
                    <p className="text-sm text-muted py-10 text-center">Niciun ordin de cumpărare încă.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={investmentChart.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <Tooltip
                                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => fmt(Number(v))}
                            />
                            <Bar dataKey="total" name="Investit" fill="rgba(139,92,246,0.6)" radius={[4, 4, 0, 0]}>
                                <LabelList dataKey="total" position="top" formatter={(v) => fmt(Number(v))} style={{ fill: "#8c8a80", fontSize: 11 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </Card>

            {/* Cumulative ROI per bucket — same full-width treatment */}
            <Card>
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="text-sm font-medium text-foreground">ROI (cumulativ)</h2>
                    {roiChart.truncated && <span className="text-[11px] text-faint shrink-0">ultimele {MAX_CHART_POINTS} din {roiSeries.length}</span>}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={roiChart.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" unit="%" />
                        <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                            formatter={(v) => `${Number(v).toFixed(2)}%`}
                        />
                        <Bar dataKey="roi" name="ROI" radius={[4, 4, 0, 0]}>
                            {roiChart.data.map((entry, i) => (
                                <Cell key={i} fill={entry.roi >= 0 ? "#22c55e" : "#ef4444"} />
                            ))}
                            <LabelList dataKey="roi" position="top" formatter={(v) => `${Number(v).toFixed(2)}%`} style={{ fill: "#8c8a80", fontSize: 11 }} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </Card>
        </div>
    );
}
