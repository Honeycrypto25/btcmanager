"use client";

import React, { useState, useMemo } from 'react';
import { Card, cn } from "@/components/ui/core";
import { TrendingUp, TrendingDown, Bitcoin, BarChart3, ArrowRight } from "lucide-react";
import Link from 'next/link';

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
                    <>Trading212&apos;s current value per period is estimated from the account&apos;s overall performance (exact per-deposit tracking isn&apos;t available) &mdash; Bitcoin&apos;s is calculated exactly from each purchase.</>
                )}
            </p>
        </>
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
    return (
        <Card>
            <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-muted text-sm py-6 text-center">No investments recorded yet.</p>
            ) : (
                <div className={cn(scrollable && "max-h-[420px] overflow-y-auto pr-1")}>
                    {rows.map((row) => (
                        <div key={row.label} className="py-3 border-b border-border last:border-0">
                            <div className="flex justify-between items-baseline mb-1.5">
                                <span className="text-sm font-medium text-foreground">{row.label}</span>
                                <div className="text-right font-num">
                                    <span className="text-sm font-medium text-foreground">{fmt(row.total.value)}</span>
                                    <span className={cn("text-xs ml-2", pnlColor(row.total.pnlPercent))}>
                                        {row.total.invested !== 0 ? `${row.total.pnlPercent >= 0 ? '+' : ''}${row.total.pnlPercent.toFixed(1)}%` : '\u2014'}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <AssetSubRow name="Bitcoin" figures={row.btc} fmt={fmt} pnlColor={pnlColor} />
                                <AssetSubRow name="Trading 212" figures={row.t212} fmt={fmt} pnlColor={pnlColor} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function AssetSubRow({
    name,
    figures,
    fmt,
    pnlColor,
}: {
    name: string;
    figures: AssetFigures;
    fmt: (n: number) => string;
    pnlColor: (n: number) => string;
}) {
    const hasData = figures.invested !== 0;
    return (
        <div className="flex justify-between items-center text-xs pl-3 border-l border-border">
            <span className="text-faint">
                {name} &middot; invested {hasData ? fmt(figures.invested) : '\u2014'}
            </span>
            <span className="font-num text-faint">
                {hasData ? (
                    <>
                        {fmt(figures.value)}{' '}
                        <span className={pnlColor(figures.pnlPercent)}>
                            {figures.pnlPercent >= 0 ? '+' : ''}{figures.pnlPercent.toFixed(1)}%
                        </span>
                    </>
                ) : (
                    '\u2014'
                )}
            </span>
        </div>
    );
}
