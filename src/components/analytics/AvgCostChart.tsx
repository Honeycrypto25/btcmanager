"use client";

import React, { useMemo } from 'react';
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
import { Scale } from "lucide-react";
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

function formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

interface TooltipPayloadItem {
    payload: { date: number; avgPrice: number; buyPrice: number; amount: number };
}

/** Defined at module scope (not inside AvgCostChart) so it isn't recreated
 * on every render. */
function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
    if (active && payload && payload.length) {
        const p = payload[0].payload;
        return (
            <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg space-y-1 min-w-[170px]">
                <p className="text-faint text-xs mb-1">{format(new Date(p.date), 'MMM dd, yyyy')}</p>
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-faint">Avg cost</span>
                    <span className="text-xs font-num font-medium text-accent">{formatCurrency(p.avgPrice)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-faint">This buy</span>
                    <span className="text-xs font-num text-foreground">
                        {p.amount.toFixed(6)} BTC @ {formatCurrency(p.buyPrice)}
                    </span>
                </div>
            </div>
        );
    }
    return null;
}

/**
 * Shows how the cumulative cost basis per BTC (the running weighted-average
 * buy price) moved as purchases happened, instead of just the final number
 * — the existing "Avg buy" reference lines on PriceChart/AdvancedChart only
 * show where it ended up, not the path it took to get there.
 */
export default function AvgCostChart({ transactions }: AvgCostChartProps) {
    const points = useMemo(() => {
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

    const currentAvg = points.length > 0 ? points[points.length - 1].avgPrice : 0;

    if (points.length === 0) {
        return (
            <Card className="p-6">
                <h3 className="text-sm font-medium text-foreground mb-1">Average cost evolution</h3>
                <div className="h-[280px] flex items-center justify-center text-muted text-sm">No purchases yet.</div>
            </Card>
        );
    }

    return (
        <Card className="p-6">
            <div className="flex justify-between items-center mb-5 gap-3">
                <div>
                    <h3 className="text-sm font-medium text-foreground">Average cost evolution</h3>
                    <p className="text-xs text-faint mt-0.5">How your cost basis per BTC moved with each purchase</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Scale className="w-3.5 h-3.5 text-faint" />
                    <span className="text-sm font-medium font-num text-foreground">{formatCurrency(currentAvg)}</span>
                </div>
            </div>

            <div className="h-[280px] w-full">
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
                            domain={['dataMin', 'dataMax']}
                            scale="time"
                            tickLine={false}
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            stroke="rgba(255,255,255,0.08)"
                            tick={{ fontSize: 10, fill: '#565550' }}
                            tickFormatter={(val) => `$${val.toLocaleString()}`}
                            width={56}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                        <Line type="stepAfter" dataKey="avgPrice" stroke="#52c98a" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Scatter dataKey="buyPrice" fill="#d6a24c" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-0.5 bg-accent" />
                    <span className="text-faint">Avg cost (cumulative)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-faint">Individual buy price</span>
                </div>
            </div>
        </Card>
    );
}
