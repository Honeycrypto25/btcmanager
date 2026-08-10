"use client";

import React, { useState, useMemo } from 'react';
import { Card, cn } from "@/components/ui/core";
import { X } from "lucide-react";
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';

interface Position {
    ticker: string;
    name: string;
    quantity: number;
    currentPrice: number;
    priceCurrency: string;
    cost: number;
    currentValue: number;
}

interface Order {
    id: string;
    ticker: string;
    name: string;
    side: string;
    quantity: number;
    price: number;
    priceCurrency: string;
    total: number;
    filledAt: string | Date;
}

export function PositionsList({
    positions,
    orders,
    currencySymbol,
}: {
    positions: Position[];
    orders: Order[];
    currencySymbol: string;
}) {
    const [selected, setSelected] = useState<Position | null>(null);
    const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    return (
        <>
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
                                <button
                                    key={p.ticker}
                                    onClick={() => setSelected(p)}
                                    className="w-full flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-left hover:bg-white/[0.03] rounded-lg transition-colors -mx-2 px-2"
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
                                </button>
                            );
                        })}
                    </div>
                )}
                <p className="text-[10px] text-faint mt-4 leading-relaxed">
                    Value and P&amp;L are converted to your account currency by Trading212 itself, so London-listed
                    instruments priced in pence are handled correctly. Tap a position to see your purchase history.
                </p>
            </Card>

            {selected && (
                <PositionModal
                    position={selected}
                    orders={orders.filter((o) => o.ticker === selected.ticker)}
                    onClose={() => setSelected(null)}
                />
            )}
        </>
    );
}

function PositionModal({
    position,
    orders,
    onClose,
}: {
    position: Position;
    orders: Order[];
    onClose: () => void;
}) {
    const priceSymbol = position.priceCurrency === 'GBX' ? 'p' : position.priceCurrency === 'GBP' ? '\u00a3' : position.priceCurrency === 'USD' ? '$' : position.priceCurrency === 'EUR' ? '\u20ac' : `${position.priceCurrency} `;
    const fmtPrice = (n: number) => `${priceSymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;

    // Cronologic (cel mai vechi primul), pentru grafic
    const chronological = useMemo(
        () => [...orders].sort((a, b) => new Date(a.filledAt).getTime() - new Date(b.filledAt).getTime()),
        [orders]
    );

    // Media ta de achiziție — media ponderată a prețurilor de CUMPĂRARE, în
    // moneda proprie a instrumentului (nu moneda contului), ca să fie direct
    // comparabilă cu prețurile din grafic, fără nicio conversie riscantă.
    const avgBuyPrice = useMemo(() => {
        const buys = chronological.filter((o) => o.side === 'BUY');
        const totalQty = buys.reduce((s, o) => s + o.quantity, 0);
        if (totalQty === 0) return 0;
        return buys.reduce((s, o) => s + o.price * o.quantity, 0) / totalQty;
    }, [chronological]);

    const chartData = chronological.map((o) => ({
        label: new Date(o.filledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        price: o.price,
        side: o.side,
    }));
    // Adăugăm prețul curent ca ultim punct, ca să vedem unde suntem acum
    // față de istoricul de achiziție.
    if (position.currentPrice > 0) {
        chartData.push({ label: 'Now', price: position.currentPrice, side: 'CURRENT' });
    }

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        const point = payload[0]?.payload;
        if (!point) return null;
        return (
            <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg">
                <p className="text-faint text-xs mb-1">{label}</p>
                <p className="text-xs font-num text-foreground">
                    {point.side === 'CURRENT' ? 'Current price' : point.side === 'BUY' ? 'Bought at' : 'Sold at'}: {fmtPrice(point.price)}
                </p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative bg-background border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
                    <div className="min-w-0">
                        <h3 className="text-base font-medium text-foreground truncate">{position.name ?? position.ticker}</h3>
                        <p className="text-xs text-faint font-num">{position.ticker}</p>
                    </div>
                    <button onClick={onClose} className="text-muted hover:text-foreground p-1 -mr-1" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {chartData.length < 2 ? (
                        <p className="text-muted text-sm text-center py-8">
                            Not enough purchase history yet to chart price evolution.
                        </p>
                    ) : (
                        <div className="h-[220px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ left: -12 }}>
                                    <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        stroke="rgba(255,255,255,0.08)"
                                        tick={{ fontSize: 10, fill: '#565550' }}
                                        tickLine={false}
                                        minTickGap={20}
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.08)"
                                        tick={{ fontSize: 10, fill: '#565550' }}
                                        tickFormatter={(val) => fmtPrice(val)}
                                        width={64}
                                        tickLine={false}
                                        axisLine={false}
                                        domain={['auto', 'auto']}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                                    {avgBuyPrice > 0 && (
                                        <ReferenceLine
                                            y={avgBuyPrice}
                                            stroke="#d6a24c"
                                            strokeDasharray="4 4"
                                            strokeWidth={1.5}
                                            label={{ value: 'Your avg.', position: 'insideTopLeft', fill: '#d6a24c', fontSize: 10 }}
                                        />
                                    )}
                                    <Line type="monotone" dataKey="price" stroke="#7c93b8" strokeWidth={1.5} dot={{ r: 3, fill: '#7c93b8', strokeWidth: 0 }} isAnimationActive={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Your avg. buy price</p>
                            <p className="text-base font-medium font-num text-primary">{avgBuyPrice > 0 ? fmtPrice(avgBuyPrice) : '\u2014'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Current price</p>
                            <p className="text-base font-medium font-num text-foreground">{fmtPrice(position.currentPrice)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Quantity held</p>
                            <p className="text-base font-medium font-num text-foreground">{position.quantity}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Orders</p>
                            <p className="text-base font-medium font-num text-foreground">{orders.length}</p>
                        </div>
                    </div>

                    <p className="text-[10px] text-faint leading-relaxed pt-3 border-t border-border">
                        This chart plots your own buy/sell order prices over time \u2014 Trading212&apos;s API doesn&apos;t
                        provide continuous market price history, so it reflects your actual trades, not a live price
                        feed. Prices shown in {position.priceCurrency}, the instrument&apos;s own trading currency.
                    </p>
                </div>
            </div>
        </div>
    );
}
