"use client";

import React, { useEffect, useMemo, useState } from 'react';
import {
    ComposedChart,
    Line,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Card } from "@/components/ui/core";
import { Scale, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Transaction {
    id: string;
    amount: number;
    priceAtTime: number;
    timestamp: string | Date;
}

interface AvgCostChartProps {
    transactions: Transaction[];
}

interface MarketPricePoint {
    date: number;
    marketPrice: number;
}

function formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

type Range = 'week' | 'month' | 'year' | 'all';

/** Start of the window for a range, or null for "all" (no lower bound). */
function rangeStart(range: Range): number | null {
    if (range === 'all') return null;
    const d = new Date();
    if (range === 'week') d.setDate(d.getDate() - 7);
    else if (range === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
}

/** Days of history to request from CoinGecko for a given range — "all"
 * reaches back to the earliest purchase (plus a couple weeks of context),
 * same approach PriceChart uses for its own "ALL" option. */
function daysForRange(range: Range, earliestTxTime: number | null): number {
    if (range === 'week') return 7;
    if (range === 'month') return 31;
    if (range === 'year') return 365;
    if (earliestTxTime === null) return 365;
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSinceFirstBuy = Math.ceil((Date.now() - earliestTxTime) / msPerDay);
    return daysSinceFirstBuy + 14;
}

interface TooltipPayloadItem {
    dataKey?: string;
    payload: { date: number; avgPrice?: number; buyPrice?: number; amount?: number; marketPrice?: number };
}

/** Defined at module scope (not inside AvgCostChart) so it isn't recreated
 * on every render. Reads each series by dataKey rather than assuming a
 * fixed payload order, since avgPrice/buyPrice and marketPrice come from
 * two independently-sampled data arrays overlaid on the same chart. */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: number }) {
    if (!active || !payload || !payload.length) return null;
    const avgEntry = payload.find((p) => p.dataKey === 'avgPrice')?.payload;
    const marketEntry = payload.find((p) => p.dataKey === 'marketPrice')?.payload;
    if (!avgEntry && !marketEntry) return null;

    return (
        <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg space-y-1 min-w-[170px]">
            <p className="text-faint text-xs mb-1">{format(new Date(label ?? avgEntry?.date ?? marketEntry?.date ?? 0), 'MMM dd, yyyy')}</p>
            {avgEntry && avgEntry.avgPrice !== undefined && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-faint">Avg cost</span>
                    <span className="text-xs font-num font-medium text-accent">{formatCurrency(avgEntry.avgPrice)}</span>
                </div>
            )}
            {avgEntry && avgEntry.buyPrice !== undefined && avgEntry.amount !== undefined && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-faint">This buy</span>
                    <span className="text-xs font-num text-foreground">
                        {avgEntry.amount.toFixed(6)} BTC @ {formatCurrency(avgEntry.buyPrice)}
                    </span>
                </div>
            )}
            {marketEntry && marketEntry.marketPrice !== undefined && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-faint">Live price</span>
                    <span className="text-xs font-num font-medium text-[#7c93b8]">{formatCurrency(marketEntry.marketPrice)}</span>
                </div>
            )}
        </div>
    );
}

/**
 * Shows how the cumulative cost basis per BTC (the running weighted-average
 * buy price) moved as purchases happened, instead of just the final number
 * — the existing "Avg buy" reference lines on PriceChart/AdvancedChart only
 * show where it ended up, not the path it took to get there. Overlays the
 * actual BTC market price for the same window, so it's clear whether the
 * average is sitting above or below where the market actually is.
 */
export default function AvgCostChart({ transactions }: AvgCostChartProps) {
    const [range, setRange] = useState<Range>('all');
    const [marketPrice, setMarketPrice] = useState<MarketPricePoint[]>([]);
    const [priceLoading, setPriceLoading] = useState(true);
    const [priceError, setPriceError] = useState(false);

    // Full cumulative history — the running average at each point must
    // always be computed from EVERY prior purchase, never just the ones
    // inside the currently selected window, or picking "Week"/"Month"
    // would show a fabricated average as if history started there.
    const allPoints = useMemo(() => {
        const sorted = [...transactions].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        // Cumulative amount/invested up to and including each transaction —
        // computed per-index from immutable slices (transaction counts are
        // small for a personal wallet, so the O(n^2) re-summing is cheap)
        // rather than a mutable running total, which the lint rule below
        // flags when captured across a .map() closure.
        return sorted.map((tx, i) => {
            const upToHere = sorted.slice(0, i + 1);
            const cumAmount = upToHere.reduce((s, t) => s + t.amount, 0);
            const cumInvested = upToHere.reduce((s, t) => s + t.amount * t.priceAtTime, 0);
            return {
                date: new Date(tx.timestamp).getTime(),
                avgPrice: cumAmount > 0 ? cumInvested / cumAmount : 0,
                buyPrice: tx.priceAtTime,
                amount: tx.amount,
            };
        });
    }, [transactions]);

    // Range only trims which points are DRAWN — avgPrice on each remaining
    // point already reflects the full history up to that date.
    const points = useMemo(() => {
        const start = rangeStart(range);
        if (start === null) return allPoints;
        return allPoints.filter((p) => p.date >= start);
    }, [allPoints, range]);

    const earliestTxTime = allPoints.length > 0 ? allPoints[0].date : null;

    // Live BTC price for the same window, straight from CoinGecko (same
    // endpoint/shape PriceChart already uses) — a separate data array from
    // `points`, overlaid on the same axes rather than merged into one
    // dataset, since the two are sampled completely differently (daily
    // candles vs. one point per purchase).
    useEffect(() => {
        let cancelled = false;
        async function run() {
            setPriceLoading(true);
            setPriceError(false);
            try {
                const days = daysForRange(range, earliestTxTime);
                const res = await fetch(
                    `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`
                );
                if (!res.ok) throw new Error('Failed to fetch price data');
                const data = await res.json();
                const prices: MarketPricePoint[] = data.prices.map(([ts, price]: [number, number]) => ({
                    date: ts,
                    marketPrice: price,
                }));
                if (!cancelled) setMarketPrice(prices);
            } catch {
                if (!cancelled) setPriceError(true);
            } finally {
                if (!cancelled) setPriceLoading(false);
            }
        }
        run();
        return () => {
            cancelled = true;
        };
    }, [range, earliestTxTime]);

    const filteredMarketPrice = useMemo(() => {
        const start = rangeStart(range);
        if (start === null) return marketPrice;
        return marketPrice.filter((p) => p.date >= start);
    }, [marketPrice, range]);

    // XAxis domain covers BOTH series — market price (dense, daily) and
    // avg-cost points (sparse, one per purchase) rarely share the exact
    // same date range, so relying on ComposedChart's own `data` prop alone
    // (points) would silently clip the live-price line at the edges.
    const xDomain = useMemo((): [number, number] | ['dataMin', 'dataMax'] => {
        const dates = [...points.map((p) => p.date), ...filteredMarketPrice.map((p) => p.date)];
        if (dates.length === 0) return ['dataMin', 'dataMax'];
        return [Math.min(...dates), Math.max(...dates)];
    }, [points, filteredMarketPrice]);

    // YAxis domain, likewise computed explicitly across all three series.
    // Recharts' 'auto'/'auto' domain only reliably picks up the market-price
    // line (the one with its own `data` prop) once a second differently-
    // scaled series is layered on top of it — the avg-cost line ends up
    // scaled against a domain that doesn't include its own values and gets
    // rendered off-canvas (this is what "the legend stopped matching the
    // chart" turned out to be: the avg-cost line and buy-price dots for the
    // narrower Week/Month/Year windows were being drawn far above the
    // visible area). Computing min/max ourselves across every series
    // avoids relying on that auto-detection entirely.
    const yDomain = useMemo((): [number, number] | ['auto', 'auto'] => {
        const vals: number[] = [];
        for (const p of points) {
            vals.push(p.avgPrice, p.buyPrice);
        }
        for (const p of filteredMarketPrice) {
            vals.push(p.marketPrice);
        }
        if (vals.length === 0) return ['auto', 'auto'];
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const padding = (max - min) * 0.08 || max * 0.05 || 1000;
        return [Math.max(0, min - padding), max + padding];
    }, [points, filteredMarketPrice]);

    // Always the true current average (full history), regardless of the
    // selected display window, so "Week" with no recent buys doesn't blank
    // out the header figure.
    const currentAvg = allPoints.length > 0 ? allPoints[allPoints.length - 1].avgPrice : 0;

    const rangeOptions: { key: Range; label: string }[] = [
        { key: 'week', label: 'Week' },
        { key: 'month', label: 'Month' },
        { key: 'year', label: 'Year' },
        { key: 'all', label: 'All' },
    ];

    if (allPoints.length === 0) {
        return (
            <Card className="p-6">
                <h3 className="text-sm font-medium text-foreground mb-1">Average cost evolution</h3>
                <div className="h-[280px] flex items-center justify-center text-muted text-sm">No purchases yet.</div>
            </Card>
        );
    }

    return (
        <Card className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div>
                    <h3 className="text-sm font-medium text-foreground">Average cost evolution</h3>
                    <p className="text-xs text-faint mt-0.5">How your cost basis per BTC moved with each purchase, vs. the live price</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <Scale className="w-3.5 h-3.5 text-faint" />
                        <span className="text-sm font-medium font-num text-foreground">{formatCurrency(currentAvg)}</span>
                    </div>
                    <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                        {rangeOptions.map((opt) => (
                            <button
                                key={opt.key}
                                onClick={() => setRange(opt.key)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                    range === opt.key ? 'bg-primary text-black' : 'text-muted hover:text-foreground'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {points.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-muted text-sm">
                    No purchases in the last {range}.
                </div>
            ) : (
                <>
                    <div className="h-[280px] w-full relative">
                        {priceLoading && filteredMarketPrice.length === 0 && (
                            <div className="absolute top-0 right-0 z-10">
                                <Loader2 className="w-3.5 h-3.5 text-faint animate-spin" />
                            </div>
                        )}
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={points}>
                                <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(tick) => format(new Date(tick), 'MMM dd')}
                                    stroke="rgba(255,255,255,0.08)"
                                    tick={{ fontSize: 10, fill: '#565550' }}
                                    minTickGap={30}
                                    type="number"
                                    domain={xDomain}
                                    scale="time"
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={yDomain}
                                    stroke="rgba(255,255,255,0.08)"
                                    tick={{ fontSize: 10, fill: '#565550' }}
                                    tickFormatter={(val) => `$${val.toLocaleString()}`}
                                    width={56}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                                {filteredMarketPrice.length > 0 && (
                                    <Line
                                        data={filteredMarketPrice}
                                        type="monotone"
                                        dataKey="marketPrice"
                                        stroke="#7c93b8"
                                        strokeWidth={1.5}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                )}
                                <Line type="stepAfter" dataKey="avgPrice" stroke="#52c98a" strokeWidth={2} dot={false} isAnimationActive={false} />
                                <Scatter dataKey="buyPrice" fill="#d6a24c" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-4 flex items-center justify-center flex-wrap gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-0.5 bg-accent" />
                            <span className="text-faint">Avg cost (cumulative)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span className="text-faint">Individual buy price</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-0.5" style={{ backgroundColor: '#7c93b8' }} />
                            <span className="text-faint">
                                Live BTC price{priceError ? ' (unavailable)' : ''}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </Card>
    );
}
