"use client";

import React, { useState, useMemo } from 'react';
import { Card, cn } from "@/components/ui/core";
import { TrendingUp, TrendingDown, Bitcoin, BarChart3, ArrowRight, Briefcase } from "lucide-react";
import Link from 'next/link';
import {
    ComposedChart,
    BarChart,
    Bar,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';

export interface AssetFigures {
    invested: number;
    value: number;
    pnl: number;
    pnlPercent: number;
}

export interface PeriodRow {
    label: string;
    btc: AssetFigures;
    t212: AssetFigures;
    total: AssetFigures;
}

export interface AssetStats {
    avgMonthlyInvested: number;
    bestMonth: { label: string; pnlPercent: number } | null;
    worstMonth: { label: string; pnlPercent: number } | null;
    activeMonths: number;
    transactionCount: number;
}

export interface OverviewData {
    totalInvested: number;
    totalValue: number;
    totalPnl: number;
    pnlPercent: number;
    btc: AssetFigures & { amount: number };
    t212: AssetFigures & { connected: boolean; hasSnapshot: boolean };
    weeklyRows: PeriodRow[];
    yearlyRows: PeriodRow[];
    monthlyRows: PeriodRow[];
    t212NativeCurrency: string | null;
    t212FxRate: number;
    btcStats: AssetStats;
    t212Stats: AssetStats;
}

// Optional — populated separately from BTC/T212 (see app/page.tsx). Never
// part of OverviewData/getOverviewData, so it can't affect the combined
// BTC/T212 totals, charts, or the email report generator that also reads
// OverviewData.
export interface SelfEmployedSnapshot {
    taxYear: string;
    totalIncome: number;
    totalExpenses: number;
    profit: number;
}

type Currency = 'USD' | 'GBP';

function scaleFigures(f: AssetFigures, factor: number): AssetFigures {
    return { invested: f.invested * factor, value: f.value * factor, pnl: f.pnl * factor, pnlPercent: f.pnlPercent };
}

function scaleRow(row: PeriodRow, factor: number): PeriodRow {
    return {
        label: row.label,
        btc: scaleFigures(row.btc, factor),
        t212: scaleFigures(row.t212, factor),
        total: scaleFigures(row.total, factor),
    };
}

export function OverviewClient({
    data,
    usdToGbp,
    selfEmployed,
}: {
    data: OverviewData;
    usdToGbp: number;
    selfEmployed?: SelfEmployedSnapshot | null;
}) {
    const [currency, setCurrency] = useState<Currency>('USD');
    const factor = currency === 'USD' ? 1 : usdToGbp;
    const symbol = currency === 'USD' ? '$' : '\u00a3';

    const view = useMemo(() => {
        return {
            totals: scaleFigures(
                { invested: data.totalInvested, value: data.totalValue, pnl: data.totalPnl, pnlPercent: data.pnlPercent },
                factor
            ),
            btc: { ...scaleFigures(data.btc, factor), amount: data.btc.amount },
            t212: { ...scaleFigures(data.t212, factor), connected: data.t212.connected, hasSnapshot: data.t212.hasSnapshot },
            weeklyRows: data.weeklyRows.map((r) => scaleRow(r, factor)),
            yearlyRows: data.yearlyRows.map((r) => scaleRow(r, factor)),
            monthlyRows: data.monthlyRows.map((r) => scaleRow(r, factor)),
            btcStats: { ...data.btcStats, avgMonthlyInvested: data.btcStats.avgMonthlyInvested * factor },
            t212Stats: { ...data.t212Stats, avgMonthlyInvested: data.t212Stats.avgMonthlyInvested * factor },
        };
    }, [data, factor]);

    const fmt = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
    const pnlColor = (n: number) => (n >= 0 ? "text-accent" : "text-red-400");

    return (
        <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Overview
                    </h1>
                    <p className="text-muted text-sm">
                        Combined performance across all your long-term investments.
                    </p>
                </div>
                <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                    {(['USD', 'GBP'] as Currency[]).map((c) => (
                        <button
                            key={c}
                            onClick={() => setCurrency(c)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                                currency === c ? "bg-primary text-black" : "text-muted hover:text-foreground"
                            )}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* Combined Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total invested</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(view.totals.invested)}</h2>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Current value</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(view.totals.value)}</h2>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total P&amp;L</p>
                    <div className="flex items-center gap-2">
                        <h2 className={cn("text-2xl font-medium font-num", pnlColor(view.totals.pnl))}>
                            {view.totals.pnl >= 0 ? '+' : ''}{fmt(Math.abs(view.totals.pnl))}
                        </h2>
                        {view.totals.pnl >= 0 ? <TrendingUp className="w-4 h-4 text-accent" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </div>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">ROI</p>
                    <h2 className={cn("text-2xl font-medium font-num", pnlColor(view.totals.pnlPercent))}>
                        {view.totals.pnlPercent >= 0 ? '+' : ''}{view.totals.pnlPercent.toFixed(2)}%
                    </h2>
                </Card>
            </div>

            {/* Per-asset breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Link href="/btc">
                    <Card hover className="flex items-center justify-between gap-4 group cursor-pointer">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                                <Bitcoin className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Bitcoin</p>
                                <p className="text-xs text-faint font-num">{view.btc.amount.toFixed(6)} BTC &middot; {fmt(view.btc.invested)} invested</p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                            <div>
                                <p className="text-sm font-medium font-num text-foreground">{fmt(view.btc.value)}</p>
                                <p className={cn("text-xs font-num", pnlColor(view.btc.pnl))}>
                                    {view.btc.pnl >= 0 ? '+' : ''}{fmt(view.btc.pnl)}
                                </p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-faint group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                    </Card>
                </Link>

                <Link href="/t212">
                    <Card hover className="flex items-center justify-between gap-4 group cursor-pointer">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center text-muted shrink-0">
                                <BarChart3 className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Trading 212</p>
                                <p className="text-xs text-faint font-num">
                                    {view.t212.connected ? `${fmt(view.t212.invested)} invested` : 'Not connected'}
                                </p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                            {view.t212.connected && view.t212.hasSnapshot ? (
                                <div>
                                    <p className="text-sm font-medium font-num text-foreground">{fmt(view.t212.value)}</p>
                                    <p className={cn("text-xs font-num", pnlColor(view.t212.pnl))}>
                                        {view.t212.pnl >= 0 ? '+' : ''}{fmt(view.t212.pnl)}
                                    </p>
                                </div>
                            ) : (
                                <span className="text-xs text-primary font-medium">Connect in Admin</span>
                            )}
                            <ArrowRight className="w-4 h-4 text-faint group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                    </Card>
                </Link>
            </div>

            {/* Self Employed snapshot (income/expenses YTD) — additive, separate
                from the BTC/T212 figures above; never combined into totals. */}
            {selfEmployed && (selfEmployed.totalIncome > 0 || selfEmployed.totalExpenses > 0) && (
                <Link href="/self-employed">
                    <Card hover className="flex items-center justify-between gap-4 group cursor-pointer">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center text-muted shrink-0">
                                <Briefcase className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Self Employed</p>
                                <p className="text-xs text-faint font-num">
                                    An fiscal {selfEmployed.taxYear} &middot; Venit {'£'}{selfEmployed.totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                            <div>
                                <p className={cn("text-sm font-medium font-num", selfEmployed.profit >= 0 ? "text-accent" : "text-red-400")}>
                                    {selfEmployed.profit >= 0 ? '+' : ''}{'£'}{selfEmployed.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                                <p className="text-xs text-faint">profit YTD</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-faint group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                    </Card>
                </Link>
            )}

            {/* Per-asset stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AssetStatsCard
                    title="Bitcoin"
                    icon={<Bitcoin className="w-4 h-4" />}
                    stats={view.btcStats}
                    fmt={fmt}
                    pnlColor={pnlColor}
                    txLabel="Purchases"
                    connected
                />
                <AssetStatsCard
                    title="Trading 212"
                    icon={<BarChart3 className="w-4 h-4" />}
                    stats={view.t212Stats}
                    fmt={fmt}
                    pnlColor={pnlColor}
                    txLabel="Buy orders"
                    connected={view.t212.connected}
                />
            </div>

            {/* Recent performance: last 3 / last 12 months vs preceding period */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TrailingPeriodsCard
                    title="Bitcoin"
                    icon={<Bitcoin className="w-4 h-4" />}
                    monthlyRows={view.monthlyRows}
                    asset="btc"
                    fmt={fmt}
                    pnlColor={pnlColor}
                    connected
                />
                <TrailingPeriodsCard
                    title="Trading 212"
                    icon={<BarChart3 className="w-4 h-4" />}
                    monthlyRows={view.monthlyRows}
                    asset="t212"
                    fmt={fmt}
                    pnlColor={pnlColor}
                    connected={view.t212.connected}
                />
            </div>

            {/* Growth chart */}
            <InvestmentChart
                weeklyRows={view.weeklyRows}
                monthlyRows={view.monthlyRows}
                yearlyRows={view.yearlyRows}
                fmt={fmt}
                btcConnected={view.btc.invested > 0}
                t212Connected={view.t212.connected}
            />

            {/* Monthly bars: invested + current value, per asset */}
            <MonthlyBarsChart weeklyRows={view.weeklyRows} monthlyRows={view.monthlyRows} yearlyRows={view.yearlyRows} fmt={fmt} />

            {/* Invested breakdown, with Week/Month/Year toggle */}
            <PeriodBreakdown weeklyRows={view.weeklyRows} monthlyRows={view.monthlyRows} yearlyRows={view.yearlyRows} fmt={fmt} pnlColor={pnlColor} />

            <p className="text-[10px] text-faint text-center leading-relaxed">
                {data.t212.connected && data.t212NativeCurrency && data.t212NativeCurrency !== 'USD' && (
                    <>Trading212 amounts converted from {data.t212NativeCurrency} at the current exchange rate — historical entries use today&apos;s rate, not the rate on the deposit date. </>
                )}
                {data.t212.connected && (
                    <>Trading212&apos;s current value per period is calculated from each order&apos;s ticker and today&apos;s price for that instrument &mdash; same approach as Bitcoin. Instruments fully sold since then fall back to a neutral (0%) assumption for that specific purchase, since we no longer have a current price for them.</>
                )}
            </p>
        </>
    );
}

type AssetScope = 'BTC' | 'T212' | 'BOTH';
type ChartView = 'area' | 'lines';
type Granularity = 'week' | 'month' | 'year' | 'custom';

interface ChartPoint {
    label: string;
    btcInvested: number;
    btcValue: number;
    t212Invested: number;
    t212Value: number;
    totalInvested: number;
    totalValue: number;
}

function buildCumulative(rowsChronological: PeriodRow[]): ChartPoint[] {
    let cumBtcInvested = 0, cumBtcValue = 0, cumT212Invested = 0, cumT212Value = 0;
    return rowsChronological.map((row) => {
        cumBtcInvested += row.btc.invested;
        cumBtcValue += row.btc.value;
        cumT212Invested += row.t212.invested;
        cumT212Value += row.t212.value;
        return {
            label: row.label,
            btcInvested: cumBtcInvested,
            btcValue: cumBtcValue,
            t212Invested: cumT212Invested,
            t212Value: cumT212Value,
            totalInvested: cumBtcInvested + cumT212Invested,
            totalValue: cumBtcValue + cumT212Value,
        };
    });
}

function InvestmentChart({
    weeklyRows,
    monthlyRows,
    yearlyRows,
    fmt,
    btcConnected,
    t212Connected,
}: {
    weeklyRows: PeriodRow[]; // cele mai recente primele, ca la tabele
    monthlyRows: PeriodRow[];
    yearlyRows: PeriodRow[];
    fmt: (n: number) => string;
    btcConnected: boolean;
    t212Connected: boolean;
}) {
    const [scope, setScope] = useState<AssetScope>('BOTH');
    const [chartView, setChartView] = useState<ChartView>('area');
    const [granularity, setGranularity] = useState<Granularity>('month');
    const [customFrom, setCustomFrom] = useState(0);
    const [customTo, setCustomTo] = useState(9999);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const chronologicalWeekly = useMemo(() => [...weeklyRows].reverse(), [weeklyRows]);
    const chronologicalMonthly = useMemo(() => [...monthlyRows].reverse(), [monthlyRows]);
    const chronologicalYearly = useMemo(() => [...yearlyRows].reverse(), [yearlyRows]);

    const weeklyCumulative = useMemo(() => buildCumulative(chronologicalWeekly), [chronologicalWeekly]);
    const monthlyCumulative = useMemo(() => buildCumulative(chronologicalMonthly), [chronologicalMonthly]);
    const yearlyCumulative = useMemo(() => buildCumulative(chronologicalYearly), [chronologicalYearly]);

    const maxMonthIndex = Math.max(0, chronologicalMonthly.length - 1);
    const fromIdx = Math.min(customFrom, maxMonthIndex);
    const toIdx = Math.min(Math.max(customTo, fromIdx), maxMonthIndex);

    const data = useMemo(() => {
        if (granularity === 'week') return weeklyCumulative;
        if (granularity === 'year') return yearlyCumulative;
        if (granularity === 'custom') return monthlyCumulative.slice(fromIdx, toIdx + 1);
        return monthlyCumulative;
    }, [granularity, weeklyCumulative, monthlyCumulative, yearlyCumulative, fromIdx, toIdx]);

    // Derulăm implicit la cele mai recente (dreapta) — cu ani de istoric
    // săptămânal/lunar, ar fi prea multe puncte ca să încapă comprimate în
    // lățimea cardului fără să devină ilizibile.
    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [data]);

    const investedKey = scope === 'BTC' ? 'btcInvested' : scope === 'T212' ? 't212Invested' : 'totalInvested';
    const valueKey = scope === 'BTC' ? 'btcValue' : scope === 'T212' ? 't212Value' : 'totalValue';

    // Diferența valoare - investit: pozitivă = profit (verde), negativă =
    // pierdere (roșu). Gradientul e poziționat exact la zero, cu intensitate
    // crescândă spre extreme — difuz lângă linia de investit, puternic acolo
    // unde diferența e cea mai mare. Folosit doar în vizualizarea "Area".
    const chartData = useMemo(
        () => data.map((d) => ({ ...d, diff: (d as any)[valueKey] - (d as any)[investedKey] })),
        [data, valueKey, investedKey]
    );

    const { zeroOffsetPercent, hasBoth } = useMemo(() => {
        const diffs = chartData.map((d) => d.diff);
        const maxDiff = Math.max(0, ...diffs);
        const minDiff = Math.min(0, ...diffs);
        const range = maxDiff - minDiff;
        return {
            zeroOffsetPercent: range > 0 ? (maxDiff / range) * 100 : 50,
            hasBoth: maxDiff > 0 && minDiff < 0,
        };
    }, [chartData]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        const point = payload[0]?.payload;
        if (!point) return null;
        const invested = point[investedKey] ?? 0;
        const value = point[valueKey] ?? 0;
        const diff = value - invested;
        return (
            <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg">
                <p className="text-faint text-xs mb-1">{label}</p>
                <p className="text-primary text-xs font-num">Invested: {fmt(invested)}</p>
                <p className="text-foreground text-xs font-num">Value: {fmt(value)}</p>
                <p className={cn("text-xs font-num", diff >= 0 ? "text-accent" : "text-red-400")}>
                    {diff >= 0 ? '+' : ''}{fmt(diff)}
                </p>
            </div>
        );
    };

    const noData = data.length === 0 || (scope === 'BTC' && !btcConnected) || (scope === 'T212' && !t212Connected);

    return (
        <Card>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div>
                    <h3 className="text-sm font-medium text-foreground">Growth over time</h3>
                    <p className="text-xs text-faint mt-0.5">
                        {chartView === 'area' ? 'Gap between invested and current value' : 'Invested vs. current value'}
                    </p>
                </div>
                <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                    {([
                        { key: 'BTC' as AssetScope, label: 'BTC' },
                        { key: 'T212' as AssetScope, label: 'T212' },
                        { key: 'BOTH' as AssetScope, label: 'Both' },
                    ]).map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => setScope(opt.key)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                scope === opt.key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart type + period controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5 pb-4 border-b border-border">
                <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                    {([
                        { key: 'area' as ChartView, label: 'Gap' },
                        { key: 'lines' as ChartView, label: 'Lines' },
                    ]).map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => setChartView(opt.key)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                chartView === opt.key ? "bg-white/[0.08] text-foreground" : "text-muted hover:text-foreground"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                        {([
                            { key: 'week' as Granularity, label: 'Week' },
                            { key: 'month' as Granularity, label: 'Month' },
                            { key: 'year' as Granularity, label: 'Year' },
                            { key: 'custom' as Granularity, label: 'Custom' },
                        ]).map((opt) => (
                            <button
                                key={opt.key}
                                onClick={() => setGranularity(opt.key)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                    granularity === opt.key ? "bg-white/[0.08] text-foreground" : "text-muted hover:text-foreground"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {granularity === 'custom' && chronologicalMonthly.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs">
                            <select
                                value={fromIdx}
                                onChange={(e) => setCustomFrom(Number(e.target.value))}
                                className="bg-white/[0.03] border border-border rounded-md py-1.5 px-2 text-foreground focus:outline-none focus:border-primary"
                            >
                                {chronologicalMonthly.map((row, i) => (
                                    <option key={row.label} value={i} disabled={i > toIdx}>{row.label}</option>
                                ))}
                            </select>
                            <span className="text-faint">&rarr;</span>
                            <select
                                value={toIdx}
                                onChange={(e) => setCustomTo(Number(e.target.value))}
                                className="bg-white/[0.03] border border-border rounded-md py-1.5 px-2 text-foreground focus:outline-none focus:border-primary"
                            >
                                {chronologicalMonthly.map((row, i) => (
                                    <option key={row.label} value={i} disabled={i < fromIdx}>{row.label}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {noData ? (
                <div className="h-[240px] flex items-center justify-center text-muted text-sm">
                    {scope === 'T212' && !t212Connected ? 'Connect Trading212 in Admin to see this.' : 'Not enough data yet.'}
                </div>
            ) : (
                <div ref={scrollRef} className="overflow-x-auto pb-1">
                    <div className="h-[240px]" style={{ minWidth: Math.max(500, data.length * 60) }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartView === 'area' ? chartData : data}>
                            <defs>
                                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#52c98a" stopOpacity={0.85} />
                                    <stop offset={`${zeroOffsetPercent}%`} stopColor="#52c98a" stopOpacity={0.06} />
                                    {hasBoth && <stop offset={`${zeroOffsetPercent}%`} stopColor="#e5605a" stopOpacity={0.06} />}
                                    <stop offset="100%" stopColor="#e5605a" stopOpacity={0.85} />
                                </linearGradient>
                                <linearGradient id="pnlLine" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#52c98a" />
                                    <stop offset={`${zeroOffsetPercent}%`} stopColor="#52c98a" />
                                    {hasBoth && <stop offset={`${zeroOffsetPercent}%`} stopColor="#e5605a" />}
                                    <stop offset="100%" stopColor="#e5605a" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis
                                dataKey="label"
                                stroke="rgba(255,255,255,0.08)"
                                tick={{ fontSize: 10, fill: '#565550' }}
                                tickLine={false}
                                minTickGap={24}
                            />
                            <YAxis
                                stroke="rgba(255,255,255,0.08)"
                                tick={{ fontSize: 10, fill: '#565550' }}
                                tickFormatter={(val) => fmt(val)}
                                width={56}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />

                            {chartView === 'area' ? (
                                <>
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
                                    <Area
                                        type="monotone"
                                        dataKey="diff"
                                        stroke="none"
                                        fill="url(#pnlGradient)"
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="diff"
                                        stroke="url(#pnlLine)"
                                        strokeWidth={1.75}
                                        dot={false}
                                        activeDot={{ r: 3, strokeWidth: 0, fill: '#fff' }}
                                        isAnimationActive={false}
                                    />
                                </>
                            ) : (
                                <>
                                    <Line
                                        type="monotone"
                                        dataKey={investedKey}
                                        stroke="#d6a24c"
                                        strokeWidth={1.5}
                                        dot={false}
                                        activeDot={{ r: 3, fill: '#d6a24c', strokeWidth: 0 }}
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey={valueKey}
                                        stroke="#52c98a"
                                        strokeWidth={1.5}
                                        dot={false}
                                        activeDot={{ r: 3, fill: '#52c98a', strokeWidth: 0 }}
                                        isAnimationActive={false}
                                    />
                                </>
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                {chartView === 'area' ? (
                    <>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-0.5 bg-accent" />
                            <span className="text-faint">Above invested</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-0.5 bg-red-400" />
                            <span className="text-faint">Below invested</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-0.5 bg-primary" />
                            <span className="text-faint">Invested</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-0.5 bg-accent" />
                            <span className="text-faint">Current value</span>
                        </div>
                    </>
                )}
            </div>
        </Card>
    );
}

function PeriodBreakdown({
    weeklyRows,
    monthlyRows,
    yearlyRows,
    fmt,
    pnlColor,
}: {
    weeklyRows: PeriodRow[];
    monthlyRows: PeriodRow[];
    yearlyRows: PeriodRow[];
    fmt: (n: number) => string;
    pnlColor: (n: number) => string;
}) {
    const [granularity, setGranularity] = useState<'week' | 'month' | 'year'>('month');
    const rows = granularity === 'week' ? weeklyRows : granularity === 'year' ? yearlyRows : monthlyRows;
    const gridCols = "grid-cols-[minmax(0,1fr)_minmax(56px,auto)_minmax(56px,auto)_minmax(40px,auto)]";

    return (
        <Card>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-foreground">Invested by {granularity}</h3>
                <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                    {(['week', 'month', 'year'] as const).map((g) => (
                        <button
                            key={g}
                            onClick={() => setGranularity(g)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                                granularity === g ? "bg-primary text-black" : "text-muted hover:text-foreground"
                            )}
                        >
                            {g}
                        </button>
                    ))}
                </div>
            </div>
            {rows.length === 0 ? (
                <p className="text-muted text-sm py-6 text-center">No investments recorded yet.</p>
            ) : (
                <>
                    <div className={cn("grid gap-x-3 pb-1.5 border-b border-border", gridCols)}>
                        <span />
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">Invested</span>
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">Value</span>
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">P&amp;L</span>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto pr-1">
                        {rows.map((row) => (
                            <div key={row.label} className="py-2.5 border-b border-border last:border-0">
                                <div className={cn("grid gap-x-3 items-baseline", gridCols)}>
                                    <span className="text-sm font-medium text-foreground truncate">{row.label}</span>
                                    <span className="text-sm font-medium font-num text-foreground text-right">
                                        {row.total.invested !== 0 ? fmt(row.total.invested) : '\u2014'}
                                    </span>
                                    <span className="text-sm font-medium font-num text-foreground text-right">{fmt(row.total.value)}</span>
                                    <span className={cn("text-xs font-num text-right", pnlColor(row.total.pnlPercent))}>
                                        {row.total.invested !== 0 ? `${row.total.pnlPercent >= 0 ? '+' : ''}${row.total.pnlPercent.toFixed(1)}%` : '\u2014'}
                                    </span>
                                </div>
                                <div className="mt-1 space-y-0.5">
                                    <AssetSubRow name="Bitcoin" figures={row.btc} fmt={fmt} pnlColor={pnlColor} gridCols={gridCols} />
                                    <AssetSubRow name="Trading 212" figures={row.t212} fmt={fmt} pnlColor={pnlColor} gridCols={gridCols} />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Card>
    );
}

function AssetSubRow({
    name,
    figures,
    fmt,
    pnlColor,
    gridCols,
}: {
    name: string;
    figures: AssetFigures;
    fmt: (n: number) => string;
    pnlColor: (n: number) => string;
    gridCols: string;
}) {
    const hasData = figures.invested !== 0;
    return (
        <div className={cn("grid gap-x-3 items-baseline text-xs pl-3 border-l border-border", gridCols)}>
            <span className="text-faint truncate">{name}</span>
            <span className="font-num text-faint text-right">{hasData ? fmt(figures.invested) : '\u2014'}</span>
            <span className="font-num text-faint text-right">{hasData ? fmt(figures.value) : '\u2014'}</span>
            <span className={cn("font-num text-right", hasData ? pnlColor(figures.pnlPercent) : "text-faint")}>
                {hasData ? `${figures.pnlPercent >= 0 ? '+' : ''}${figures.pnlPercent.toFixed(1)}%` : '\u2014'}
            </span>
        </div>
    );
}

function AssetStatsCard({
    title,
    icon,
    stats,
    fmt,
    pnlColor,
    txLabel,
    connected,
}: {
    title: string;
    icon: React.ReactNode;
    stats: AssetStats;
    fmt: (n: number) => string;
    pnlColor: (n: number) => string;
    txLabel: string;
    connected: boolean;
}) {
    if (!connected) {
        return (
            <Card>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-muted">{icon}</span>
                    <h3 className="text-sm font-medium text-foreground">{title}</h3>
                </div>
                <p className="text-muted text-sm py-6 text-center">Not connected yet.</p>
            </Card>
        );
    }

    if (stats.activeMonths === 0) {
        return (
            <Card>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-primary">{icon}</span>
                    <h3 className="text-sm font-medium text-foreground">{title}</h3>
                </div>
                <p className="text-muted text-sm py-6 text-center">No investments recorded yet.</p>
            </Card>
        );
    }

    return (
        <Card>
            <div className="flex items-center gap-2 mb-4">
                <span className="text-primary">{icon}</span>
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Avg. monthly invested</p>
                    <p className="text-base font-medium font-num text-foreground">{fmt(stats.avgMonthlyInvested)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">{txLabel}</p>
                    <p className="text-base font-medium font-num text-foreground">{stats.transactionCount}</p>
                </div>
                <div>
                    <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Best month</p>
                    {stats.bestMonth ? (
                        <p className="text-base font-medium font-num">
                            <span className="text-foreground">{stats.bestMonth.label}</span>{' '}
                            <span className={pnlColor(stats.bestMonth.pnlPercent)}>
                                {stats.bestMonth.pnlPercent >= 0 ? '+' : ''}{stats.bestMonth.pnlPercent.toFixed(1)}%
                            </span>
                        </p>
                    ) : (
                        <p className="text-base text-faint">&mdash;</p>
                    )}
                </div>
                <div>
                    <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Worst month</p>
                    {stats.worstMonth ? (
                        <p className="text-base font-medium font-num">
                            <span className="text-foreground">{stats.worstMonth.label}</span>{' '}
                            <span className={pnlColor(stats.worstMonth.pnlPercent)}>
                                {stats.worstMonth.pnlPercent >= 0 ? '+' : ''}{stats.worstMonth.pnlPercent.toFixed(1)}%
                            </span>
                        </p>
                    ) : (
                        <p className="text-base text-faint">&mdash;</p>
                    )}
                </div>
            </div>
            <p className="text-[10px] text-faint mt-4 pt-3 border-t border-border">
                Across {stats.activeMonths} active month{stats.activeMonths === 1 ? '' : 's'}.
            </p>
        </Card>
    );
}

interface TrailingStats {
    monthsAvailable: number;
    avgMonthlyInvested: number;
    /** null = nu există o perioadă anterioară completă cu care să comparăm */
    avgChangePercent: number | null;
    invested: number;
    value: number;
    returnPercent: number;
}

/**
 * rowsNewestFirst = view.monthlyRows, deja sortat cel mai recent primul.
 * "Precedenta perioadă" = fereastra de aceeași mărime, imediat înainte
 * (ex: pentru "ultimele 3 luni", precedenta e lunile 4-6 în urmă).
 */
function computeTrailingStats(rowsNewestFirst: PeriodRow[], asset: 'btc' | 't212', windowSize: number): TrailingStats {
    const current = rowsNewestFirst.slice(0, windowSize);
    const preceding = rowsNewestFirst.slice(windowSize, windowSize * 2);

    const sum = (rows: PeriodRow[], key: 'invested' | 'value') => rows.reduce((s, r) => s + r[asset][key], 0);

    const invested = sum(current, 'invested');
    const value = sum(current, 'value');
    const avgMonthlyInvested = current.length > 0 ? invested / current.length : 0;

    const precedingAvg = preceding.length > 0 ? sum(preceding, 'invested') / preceding.length : 0;
    const avgChangePercent = preceding.length > 0 && precedingAvg !== 0
        ? ((avgMonthlyInvested - precedingAvg) / Math.abs(precedingAvg)) * 100
        : null;

    const returnPercent = invested !== 0 ? ((value - invested) / invested) * 100 : 0;

    return { monthsAvailable: current.length, avgMonthlyInvested, avgChangePercent, invested, value, returnPercent };
}

function TrailingPeriodsCard({
    title,
    icon,
    monthlyRows,
    asset,
    fmt,
    pnlColor,
    connected,
}: {
    title: string;
    icon: React.ReactNode;
    monthlyRows: PeriodRow[];
    asset: 'btc' | 't212';
    fmt: (n: number) => string;
    pnlColor: (n: number) => string;
    connected: boolean;
}) {
    const periods = useMemo(() => ([
        { label: 'Last 3 months', stats: computeTrailingStats(monthlyRows, asset, 3) },
        { label: 'Last 12 months', stats: computeTrailingStats(monthlyRows, asset, 12) },
    ]), [monthlyRows, asset]);

    const hasAnyData = periods.some((p) => p.stats.monthsAvailable > 0 && p.stats.invested !== 0);
    const gridCols = "grid-cols-[minmax(0,1fr)_minmax(60px,auto)_minmax(56px,auto)_minmax(56px,auto)_minmax(44px,auto)]";

    if (!connected || !hasAnyData) {
        return (
            <Card>
                <div className="flex items-center gap-2 mb-1">
                    <span className={connected ? "text-primary" : "text-muted"}>{icon}</span>
                    <h3 className="text-sm font-medium text-foreground">{title}</h3>
                </div>
                <p className="text-muted text-sm py-6 text-center">
                    {connected ? 'No investments recorded yet.' : 'Not connected yet.'}
                </p>
            </Card>
        );
    }

    return (
        <Card>
            <div className="flex items-center gap-2 mb-4">
                <span className="text-primary">{icon}</span>
                <h3 className="text-sm font-medium text-foreground">{title} &middot; recent performance</h3>
            </div>

            <div className={cn("grid gap-x-2 pb-1.5 border-b border-border", gridCols)}>
                <span />
                <span className="text-[10px] text-faint uppercase tracking-wider text-right">Avg/mo</span>
                <span className="text-[10px] text-faint uppercase tracking-wider text-right">Invested</span>
                <span className="text-[10px] text-faint uppercase tracking-wider text-right">Value</span>
                <span className="text-[10px] text-faint uppercase tracking-wider text-right">Return</span>
            </div>

            {periods.map(({ label, stats }) => (
                <div key={label} className={cn("grid gap-x-2 items-baseline py-2.5 border-b border-border last:border-0", gridCols)}>
                    <span className="text-sm font-medium text-foreground truncate">{label}</span>
                    <div className="text-right">
                        <p className="text-sm font-medium font-num text-foreground">{fmt(stats.avgMonthlyInvested)}</p>
                        {stats.avgChangePercent !== null && (
                            <p className={cn("text-[10px] font-num", pnlColor(stats.avgChangePercent))}>
                                {stats.avgChangePercent >= 0 ? '+' : ''}{stats.avgChangePercent.toFixed(0)}% vs prior
                            </p>
                        )}
                    </div>
                    <span className="text-sm font-medium font-num text-foreground text-right">{fmt(stats.invested)}</span>
                    <span className="text-sm font-medium font-num text-foreground text-right">{fmt(stats.value)}</span>
                    <span className={cn("text-xs font-num text-right", pnlColor(stats.returnPercent))}>
                        {stats.invested !== 0 ? `${stats.returnPercent >= 0 ? '+' : ''}${stats.returnPercent.toFixed(1)}%` : '\u2014'}
                    </span>
                </div>
            ))}

            <p className="text-[10px] text-faint mt-3 leading-relaxed">
                &quot;vs prior&quot; compares the average monthly investment to the equal-length period right before it.
            </p>
        </Card>
    );
}

function MonthlyBarsChart({
    weeklyRows,
    monthlyRows,
    yearlyRows,
    fmt,
}: {
    weeklyRows: PeriodRow[];
    monthlyRows: PeriodRow[];
    yearlyRows: PeriodRow[];
    fmt: (n: number) => string;
}) {
    const [granularity, setGranularity] = useState<'week' | 'month' | 'year'>('month');
    const [isolated, setIsolated] = useState<'all' | 'BTC' | 'T212'>('all');
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const chronological = useMemo(() => {
        const rows = granularity === 'week' ? weeklyRows : granularity === 'year' ? yearlyRows : monthlyRows;
        return [...rows].reverse().map((row) => ({
            label: row.label,
            btcInvested: row.btc.invested,
            btcValue: row.btc.value,
            t212Invested: row.t212.invested,
            t212Value: row.t212.value,
        }));
    }, [weeklyRows, monthlyRows, yearlyRows, granularity]);

    // Derulăm implicit la cele mai recente perioade (dreapta) — pentru
    // istoric mai vechi, se poate derula înapoi (stânga) din bara de scroll.
    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [chronological]);

    // Total și randament — pe tot ce e încărcat în grafic (toate perioadele
    // din granularitatea curentă), nu doar fereastra vizibilă.
    const totals = useMemo(() => {
        const btcInvested = chronological.reduce((s, r) => s + r.btcInvested, 0);
        const btcValue = chronological.reduce((s, r) => s + r.btcValue, 0);
        const t212Invested = chronological.reduce((s, r) => s + r.t212Invested, 0);
        const t212Value = chronological.reduce((s, r) => s + r.t212Value, 0);
        const invested = btcInvested + t212Invested;
        const value = btcValue + t212Value;
        return {
            invested,
            value,
            pnlPercent: invested !== 0 ? ((value - invested) / invested) * 100 : 0,
            btcPercent: btcInvested !== 0 ? ((btcValue - btcInvested) / btcInvested) * 100 : 0,
            t212Percent: t212Invested !== 0 ? ((t212Value - t212Invested) / t212Invested) * 100 : 0,
        };
    }, [chronological]);

    const pnlColor = (n: number) => (n >= 0 ? "text-accent" : "text-red-400");

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        const point = payload[0]?.payload;
        if (!point) return null;

        const totalInvested = point.btcInvested + point.t212Invested;
        const totalValue = point.btcValue + point.t212Value;

        const Row = ({ color, name, value, filled, valueColorClass }: { color: string; name: string; value: number; filled: boolean; valueColorClass?: string }) => (
            <div className="flex items-center gap-2 justify-between">
                <span className="flex items-center gap-1.5">
                    <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={filled ? { backgroundColor: color } : { border: `1.5px solid ${color}`, backgroundColor: 'transparent' }}
                    />
                    <span className={cn("text-xs", filled ? "text-foreground" : "text-faint")}>{name}</span>
                </span>
                <span className={cn("text-xs font-num", filled ? cn(valueColorClass ?? "text-foreground", "font-medium") : "text-faint")}>{fmt(value)}</span>
            </div>
        );

        return (
            <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg space-y-1 min-w-[170px]">
                <p className="text-faint text-xs mb-1.5">{label}</p>
                <Row color="#d6a24c" name="BTC invested" value={point.btcInvested} filled={false} />
                <Row color="#d6a24c" name="BTC value" value={point.btcValue} filled valueColorClass={point.btcInvested !== 0 ? pnlColor(point.btcValue - point.btcInvested) : undefined} />
                <Row color="#7c93b8" name="T212 invested" value={point.t212Invested} filled={false} />
                <Row color="#7c93b8" name="T212 value" value={point.t212Value} filled valueColorClass={point.t212Invested !== 0 ? pnlColor(point.t212Value - point.t212Invested) : undefined} />
                <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-border">
                    <span className="text-xs text-muted">Total invested</span>
                    <span className="text-xs font-num text-muted">{fmt(totalInvested)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground font-medium">Total value</span>
                    <span className={cn("text-xs font-num font-medium", pnlColor(totalValue - totalInvested))}>{fmt(totalValue)}</span>
                </div>
            </div>
        );
    };

    if (chronological.length === 0) {
        return (
            <Card>
                <h3 className="text-sm font-medium text-foreground mb-1">Invested vs. value</h3>
                <div className="h-[260px] flex items-center justify-center text-muted text-sm">Not enough data yet.</div>
            </Card>
        );
    }

    // Lățime per perioadă, ca barele să rămână lizibile — arătăm implicit
    // ultimele ~12 (derulat la dreapta), restul e accesibil prin derulare.
    const perPeriodWidth = 90;
    const minWidth = Math.max(500, chronological.length * perPeriodWidth);

    return (
        <Card>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-1">
                <div>
                    <h3 className="text-sm font-medium text-foreground">Invested vs. value</h3>
                    <p className="text-xs text-faint mt-0.5">
                        What went in each {granularity}, and what it&apos;s worth today &mdash; per asset
                    </p>
                </div>
                <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                    {([
                        { key: 'week' as const, label: 'Week' },
                        { key: 'month' as const, label: 'Month' },
                        { key: 'year' as const, label: 'Year' },
                    ]).map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => setGranularity(opt.key)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                granularity === opt.key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Total summary */}
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 py-4 mb-4 border-b border-border font-num">
                <div>
                    <span className="text-[10px] text-faint uppercase tracking-wider mr-1.5">Invested</span>
                    <span className="text-sm font-medium text-foreground">{fmt(totals.invested)}</span>
                </div>
                <div>
                    <span className="text-[10px] text-faint uppercase tracking-wider mr-1.5">Value</span>
                    <span className="text-sm font-medium text-foreground">{fmt(totals.value)}</span>
                </div>
                <div>
                    <span className="text-[10px] text-faint uppercase tracking-wider mr-1.5">Return</span>
                    <span className={cn("text-sm font-medium", pnlColor(totals.pnlPercent))}>
                        {totals.pnlPercent >= 0 ? '+' : ''}{totals.pnlPercent.toFixed(1)}%
                    </span>
                </div>
            </div>

            <div ref={scrollRef} className="overflow-x-auto pb-1">
                <div className="h-[280px]" style={{ minWidth }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chronological} barGap={2} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis
                                dataKey="label"
                                stroke="rgba(255,255,255,0.08)"
                                tick={{ fontSize: 10, fill: '#565550' }}
                                tickLine={false}
                            />
                            <YAxis
                                stroke="rgba(255,255,255,0.08)"
                                tick={{ fontSize: 10, fill: '#565550' }}
                                tickFormatter={(val) => fmt(val)}
                                width={56}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                            {isolated !== 'T212' && (
                                <>
                                    <Bar dataKey="btcInvested" name="BTC invested" fill="#d6a24c" fillOpacity={0.12} stroke="#d6a24c" strokeWidth={1.5} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                                    <Bar dataKey="btcValue" name="BTC value" fill="#d6a24c" fillOpacity={1} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                                </>
                            )}
                            {isolated !== 'BTC' && (
                                <>
                                    <Bar dataKey="t212Invested" name="T212 invested" fill="#7c93b8" fillOpacity={0.12} stroke="#7c93b8" strokeWidth={1.5} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                                    <Bar dataKey="t212Value" name="T212 value" fill="#7c93b8" fillOpacity={1} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                                </>
                            )}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {chronological.length > 12 && (
                <p className="text-[10px] text-faint text-center mt-1">
                    Showing recent {granularity}s &mdash; scroll left for earlier history
                </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
                <button
                    type="button"
                    onClick={() => setIsolated(isolated === 'BTC' ? 'all' : 'BTC')}
                    className={cn(
                        "flex items-center gap-3 px-2.5 py-1.5 rounded-lg border transition-colors",
                        isolated === 'BTC' ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-white/[0.03]",
                        isolated === 'T212' && "opacity-40"
                    )}
                >
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ border: '1.5px solid #d6a24c' }} />
                        <span className="text-faint">BTC invested</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#d6a24c' }} />
                        <span className="text-faint">value</span>
                        <span className={cn("font-num font-medium", pnlColor(totals.btcPercent))}>
                            {totals.btcPercent >= 0 ? '+' : ''}{totals.btcPercent.toFixed(1)}%
                        </span>
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setIsolated(isolated === 'T212' ? 'all' : 'T212')}
                    className={cn(
                        "flex items-center gap-3 px-2.5 py-1.5 rounded-lg border transition-colors",
                        isolated === 'T212' ? "border-[#7c93b8]/40 bg-[#7c93b8]/5" : "border-transparent hover:bg-white/[0.03]",
                        isolated === 'BTC' && "opacity-40"
                    )}
                >
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ border: '1.5px solid #7c93b8' }} />
                        <span className="text-faint">T212 invested</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#7c93b8' }} />
                        <span className="text-faint">value</span>
                        <span className={cn("font-num font-medium", pnlColor(totals.t212Percent))}>
                            {totals.t212Percent >= 0 ? '+' : ''}{totals.t212Percent.toFixed(1)}%
                        </span>
                    </span>
                </button>
            </div>
            {isolated !== 'all' && (
                <p className="text-[10px] text-faint text-center mt-2">
                    Showing {isolated} only &mdash; click it again to show both
                </p>
            )}
        </Card>
    );
}
