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
} from "recharts";
import { format, differenceInCalendarMonths } from "date-fns";
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

    const portfolioSeries = useMemo(
        () =>
            filteredDailySnapshots.map((s) => ({
                date: format(new Date(s.capturedAt), "d MMM"),
                "Valoare totală": Math.round(s.totalValue * 100) / 100,
                Investit: Math.round(s.investedValue * 100) / 100,
            })),
        [filteredDailySnapshots]
    );

    const pnlSeries = useMemo(
        () =>
            filteredDailySnapshots.map((s) => ({
                date: format(new Date(s.capturedAt), "d MMM"),
                pnl: Math.round(s.resultPpl * 100) / 100,
                pnlPercent: s.investedValue > 0 ? Math.round((s.resultPpl / s.investedValue) * 10000) / 100 : 0,
            })),
        [filteredDailySnapshots]
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

    const monthlyInvestmentSeries = useMemo(() => {
        const byMonth = new Map<string, { key: string; label: string; total: number }>();
        for (const o of buyOrders) {
            const d = new Date(o.filledAt);
            const key = format(d, "yyyy-MM");
            const existing = byMonth.get(key) ?? { key, label: format(d, "MMM yyyy"), total: 0 };
            existing.total += o.total;
            byMonth.set(key, existing);
        }
        return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
    }, [buyOrders]);

    // "ROI lunar/anual" here means: the cumulative ROI (total unrealized P&L
    // over total invested capital, at that point in time) observed at the end
    // of each calendar month/year — a running temperature check, not a
    // month-by-month delta. With money going in continuously via
    // auto-invest, a clean per-month delta isn't really separable from new
    // contributions without misleading assumptions, so this progression is
    // the honest way to show "how is the ROI trending" over time.
    const monthlyRoiSeries = useMemo(() => {
        const byMonth = new Map<string, { key: string; label: string; roi: number }>();
        for (const s of dailySnapshots) {
            const d = new Date(s.capturedAt);
            const key = format(d, "yyyy-MM");
            const roi = s.investedValue > 0 ? (s.resultPpl / s.investedValue) * 100 : 0;
            byMonth.set(key, { key, label: format(d, "MMM yyyy"), roi: Math.round(roi * 100) / 100 }); // later entries in the same month overwrite — we want the month-END value
        }
        return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
    }, [dailySnapshots]);

    const annualRoiSeries = useMemo(() => {
        const byYear = new Map<string, { key: string; roi: number }>();
        for (const s of dailySnapshots) {
            const d = new Date(s.capturedAt);
            const key = format(d, "yyyy");
            const roi = s.investedValue > 0 ? (s.resultPpl / s.investedValue) * 100 : 0;
            byYear.set(key, { key, roi: Math.round(roi * 100) / 100 });
        }
        return [...byYear.values()].sort((a, b) => a.key.localeCompare(b.key));
    }, [dailySnapshots]);

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

            {/* Portfolio evolution */}
            <Card>
                <h2 className="mb-4 text-sm font-medium text-foreground">Evoluție portofoliu — valoare totală vs. investit</h2>
                <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={portfolioSeries}>
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
                <h2 className="mb-4 text-sm font-medium text-foreground">Evoluție profitabilitate (P&amp;L nerealizat)</h2>
                <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={pnlSeries}>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Monthly investment */}
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">Investiție lunară</h2>
                    {monthlyInvestmentSeries.length === 0 ? (
                        <p className="text-sm text-muted py-10 text-center">Niciun ordin de cumpărare încă.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={monthlyInvestmentSeries}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                                <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                                <Tooltip
                                    contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                    formatter={(v) => fmt(Number(v))}
                                />
                                <Bar dataKey="total" name="Investit" fill="rgba(139,92,246,0.6)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </Card>

                {/* Monthly ROI */}
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">ROI lunar (cumulativ)</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlyRoiSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" unit="%" />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => `${Number(v).toFixed(2)}%`}
                            />
                            <Bar dataKey="roi" name="ROI" radius={[4, 4, 0, 0]}>
                                {monthlyRoiSeries.map((entry, i) => (
                                    <Cell key={i} fill={entry.roi >= 0 ? "#22c55e" : "#ef4444"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* Annual ROI */}
            <Card>
                <h2 className="mb-4 text-sm font-medium text-foreground">ROI anual (cumulativ)</h2>
                {annualRoiSeries.length <= 1 ? (
                    <p className="text-sm text-muted py-6 text-center">
                        Prea puțin istoric pentru un grafic anual — {annualRoiSeries[0] ? `${annualRoiSeries[0].roi.toFixed(2)}% în ${annualRoiSeries[0].key}` : "încă"}.
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={annualRoiSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="key" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" unit="%" />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => `${Number(v).toFixed(2)}%`}
                            />
                            <Bar dataKey="roi" name="ROI" radius={[4, 4, 0, 0]}>
                                {annualRoiSeries.map((entry, i) => (
                                    <Cell key={i} fill={entry.roi >= 0 ? "#22c55e" : "#ef4444"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </Card>
        </div>
    );
}
