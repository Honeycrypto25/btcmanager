"use client";

import React, { useMemo } from 'react';
import { Card } from "@/components/ui/core";
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
    side: string;
    quantity: number;
    price: number;
    filledAt: string | Date;
}

export function PositionPriceChart({ position, orders }: { position: Position; orders: Order[] }) {
    const priceSymbol = position.priceCurrency === 'GBX' ? 'p' : position.priceCurrency === 'GBP' ? '\u00a3' : position.priceCurrency === 'USD' ? '$' : position.priceCurrency === 'EUR' ? '\u20ac' : `${position.priceCurrency} `;
    const fmtPrice = (n: number) => `${priceSymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;

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
        label: new Date(o.filledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }),
        price: o.price,
        side: o.side,
    }));
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

    const scrollRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [chartData.length]);

    return (
        <Card>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-foreground">Your purchase price history</h3>
            </div>

            {chartData.length < 2 ? (
                <p className="text-muted text-sm text-center py-10">
                    Not enough purchase history yet to chart price evolution.
                </p>
            ) : (
                <div ref={scrollRef} className="overflow-x-auto pb-1">
                <div className="h-[260px]" style={{ minWidth: Math.max(500, chartData.length * 70) }}>
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
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border">
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

            <p className="text-[10px] text-faint leading-relaxed pt-4 mt-4 border-t border-border">
                This chart plots your own buy/sell order prices over time &mdash; Trading212&apos;s API doesn&apos;t
                provide continuous market price history, so it reflects your actual trades, not a live price feed.
                Prices shown in {position.priceCurrency}, the instrument&apos;s own trading currency.
            </p>
        </Card>
    );
}
