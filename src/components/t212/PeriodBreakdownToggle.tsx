"use client";

import React, { useState } from 'react';
import { Card, cn } from "@/components/ui/core";

export interface PeriodRow {
    label: string;
    invested: number;
    value: number;
    pnl: number;
    pnlPercent: number;
}

type Granularity = 'week' | 'month' | 'year';

export function PeriodBreakdownToggle({
    title,
    weeklyRows,
    monthlyRows,
    yearlyRows,
    currencySymbol,
}: {
    title: string;
    weeklyRows: PeriodRow[];
    monthlyRows: PeriodRow[];
    yearlyRows: PeriodRow[];
    currencySymbol: string;
}) {
    const [granularity, setGranularity] = useState<Granularity>('month');
    const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    const rows = granularity === 'week' ? weeklyRows : granularity === 'year' ? yearlyRows : monthlyRows;
    const gridCols = "grid-cols-[minmax(0,1fr)_minmax(60px,auto)_minmax(60px,auto)_minmax(48px,auto)]";

    return (
        <Card>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">{title} by {granularity}</h3>
                <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                    {(['week', 'month', 'year'] as Granularity[]).map((g) => (
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
                <p className="text-muted text-sm py-6 text-center">No activity recorded yet.</p>
            ) : (
                <>
                    <div className={cn("grid gap-x-2 pb-1.5 border-b border-border", gridCols)}>
                        <span />
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">Invested</span>
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">Value</span>
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">P&amp;L</span>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto pr-1">
                        {rows.map((row) => (
                            <div key={row.label} className={cn("grid gap-x-2 items-baseline py-2.5 border-b border-border last:border-0", gridCols)}>
                                <span className="text-sm font-medium text-foreground truncate">{row.label}</span>
                                <span className="text-sm font-num text-foreground text-right">{row.invested !== 0 ? fmt(row.invested) : '\u2014'}</span>
                                <span className="text-sm font-num text-foreground text-right">{fmt(row.value)}</span>
                                <span className={cn("text-xs font-num text-right", row.invested !== 0 ? (row.pnlPercent >= 0 ? "text-accent" : "text-red-400") : "text-faint")}>
                                    {row.invested !== 0 ? `${row.pnlPercent >= 0 ? '+' : ''}${row.pnlPercent.toFixed(1)}%` : '\u2014'}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Card>
    );
}
