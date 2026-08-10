"use client";

import React from 'react';
import { Card, cn } from "@/components/ui/core";
import Link from 'next/link';

interface Position {
    ticker: string;
    name: string;
    quantity: number;
    currentPrice: number;
    priceCurrency: string;
    cost: number;
    currentValue: number;
}

export function PositionsList({
    positions,
    currencySymbol,
}: {
    positions: Position[];
    currencySymbol: string;
}) {
    const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    return (
        <Card>
            <h3 className="text-sm font-medium text-foreground mb-4">Open positions</h3>
            {positions.length === 0 ? (
                <p className="text-muted text-sm py-6 text-center">No open positions.</p>
            ) : (
                <div className="divide-y divide-border">
                    {positions.map((p) => {
                        const cost = p.cost ?? 0;
                        const currentValue = p.currentValue ?? 0;
                        const pnl = currentValue - cost;
                        const isProfit = pnl >= 0;
                        return (
                            <Link
                                key={p.ticker}
                                href={`/t212/${encodeURIComponent(p.ticker)}`}
                                className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 hover:bg-white/[0.03] rounded-lg transition-colors -mx-2 px-2"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{p.name ?? p.ticker}</p>
                                    <p className="text-xs text-faint font-num">{p.quantity} &times; {p.ticker}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-medium font-num text-foreground">{fmt(currentValue)}</p>
                                    <p className={cn("text-xs font-num", isProfit ? "text-accent" : "text-red-400")}>
                                        {isProfit ? '+' : ''}{fmt(pnl)}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
            <p className="text-[10px] text-faint mt-4 leading-relaxed">
                Value and P&amp;L are converted to your account currency by Trading212 itself, so London-listed
                instruments priced in pence are handled correctly. Tap a position for its full history.
            </p>
        </Card>
    );
}
