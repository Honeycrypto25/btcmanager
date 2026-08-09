"use client";

import React, { useState, useMemo } from 'react';
import { Card, cn } from "@/components/ui/core";
import { TrendingUp, TrendingDown, Bitcoin, BarChart3, ArrowRight } from "lucide-react";
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
    yearlyRows: PeriodRow[];
    monthlyRows: PeriodRow[];
    t212NativeCurrency: string | null;
    t212FxRate: number;
    btcStats: AssetStats;
    t212Stats: AssetStats;
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

export function OverviewClient({ data, usdToGbp }: { data: OverviewData; usdToGbp: number }) {
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
                monthlyRows={view.monthlyRows}
                yearlyRows={view.yearlyRows}
                fmt={fmt}
                btcConnected={view.btc.invested > 0}
                t212Connected={view.t212.connected}
            />

            {/* Monthly bars: invested + current value, per asset */}
            <MonthlyBarsChart monthlyRows={view.monthlyRows} fmt={fmt} />

            {/* Yearly / Monthly invested breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PeriodBreakdown title="Invested by year" rows={view.yearlyRows} fmt={fmt} pnlColor={pnlColor} scrollable={false} />
                <PeriodBreakdown title="Invested by month" rows={view.monthlyRows} fmt={fmt} pnlColor={pnlColor} scrollable />
            </div>

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
type Granularity = 'month' | 'year' | 'custom';

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
    monthlyRows,
    yearlyRows,
    fmt,
    btcConnected,
    t212Connected,
}: {
    monthlyRows: PeriodRow[]; // cele mai recente primele, ca la tabele
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

    const chronologicalMonthly = useMemo(() => [...monthlyRows].reverse(), [monthlyRows]);
    const chronologicalYearly = useMemo(() => [...yearlyRows].reverse(), [yearlyRows]);

    const monthlyCumulative = useMemo(() => buildCumulative(chronologicalMonthly), [chronologicalMonthly]);
    const yearlyCumulative = useMemo(() => buildCumulative(chronologicalYearly), [chronologicalYearly]);

    const maxMonthIndex = Math.max(0, chronologicalMonthly.length - 1);
    const fromIdx = Math.min(customFrom, maxMonthIndex);
    const toIdx = Math.min(Math.max(customTo, fromIdx), maxMonthIndex);

    const data = useMemo(() => {
        if (granularity === 'year') return yearlyCumulative;
        if (granularity === 'custom') return monthlyCumulative.slice(fromIdx, toIdx + 1);
        return monthlyCumulative;
    }, [granularity, monthlyCumulative, yearlyCumulative, fromIdx, toIdx]);

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
                <div className="h-[240px] w-full">
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
    title,
    rows,
    fmt,
    pnlColor,
    scrollable,
}: {
    title: string;
    rows: PeriodRow[];
    fmt: (n: number) => string;
    pnlColor: (n: number) => string;
    scrollable: boolean;
}) {
    const gridCols = "grid-cols-[minmax(0,1fr)_minmax(56px,auto)_minmax(56px,auto)_minmax(40px,auto)]";

    return (
        <Card>
            <h3 className="text-sm font-medium text-foreground mb-2">{title}</h3>
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
                    <div className={cn(scrollable && "max-h-[420px] overflow-y-auto pr-1")}>
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

function MonthlyBarsChart({ monthlyRows, fmt }: { monthlyRows: PeriodRow[]; fmt: (n: number) => string }) {
    const chronological = useMemo(() => {
        return [...monthlyRows].reverse().map((row) => ({
            label: row.label,
            btcInvested: row.btc.invested,
            btcValue: row.btc.value,
            t212Invested: row.t212.invested,
            t212Value: row.t212.value,
        }));
    }, [monthlyRows]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        const point = payload[0]?.payload;
        if (!point) return null;
        return (
            <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg space-y-0.5">
                <p className="text-faint text-xs mb-1">{label}</p>
                <p className="text-xs font-num"><span className="text-primary">BTC invested:</span> {fmt(point.btcInvested)}</p>
                <p className="text-xs font-num"><span className="text-primary">BTC value:</span> {fmt(point.btcValue)}</p>
                <p className="text-xs font-num"><span className="text-[#7c93b8]">T212 invested:</span> {fmt(point.t212Invested)}</p>
                <p className="text-xs font-num"><span className="text-[#7c93b8]">T212 value:</span> {fmt(point.t212Value)}</p>
            </div>
        );
    };

    if (chronological.length === 0) {
        return (
            <Card>
                <h3 className="text-sm font-medium text-foreground mb-1">Monthly invested vs. value</h3>
                <div className="h-[260px] flex items-center justify-center text-muted text-sm">Not enough data yet.</div>
            </Card>
        );
    }

    // Lățime minimă per lună, ca barele să rămână lizibile — derulare
    // orizontală dacă sunt multe luni, în loc să se înghesuie ilizibil.
    const minWidth = Math.max(600, chronological.length * 90);

    return (
        <Card>
            <h3 className="text-sm font-medium text-foreground mb-0.5">Monthly invested vs. value</h3>
            <p className="text-xs text-faint mb-5">How much went in each month, and what it&apos;s worth today &mdash; per asset</p>

            <div className="overflow-x-auto pb-1">
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
                            <Bar dataKey="btcInvested" name="BTC invested" fill="#d6a24c" fillOpacity={0.4} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="btcValue" name="BTC value" fill="#d6a24c" fillOpacity={0.95} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="t212Invested" name="T212 invested" fill="#7c93b8" fillOpacity={0.4} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="t212Value" name="T212 value" fill="#7c93b8" fillOpacity={0.95} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#d6a24c', opacity: 0.4 }} />
                    <span className="text-faint">BTC invested</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#d6a24c' }} />
                    <span className="text-faint">BTC value</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#7c93b8', opacity: 0.4 }} />
                    <span className="text-faint">T212 invested</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#7c93b8' }} />
                    <span className="text-faint">T212 value</span>
                </div>
            </div>
        </Card>
    );
}
