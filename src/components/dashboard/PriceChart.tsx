
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceDot
} from 'recharts';
import { Card } from "@/components/ui/core";
import { Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface Transaction {
    id: string;
    amount: number;
    priceAtTime: number;
    timestamp: string | Date; // Can be ISO string or Date
    wallet?: { name: string };
}

interface PriceChartProps {
    transactions: Transaction[];
}

export default function PriceChart({ transactions }: PriceChartProps) {
    const [priceData, setPriceData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState<number | 'max'>(30);
    const [selectedWallets, setSelectedWallets] = useState<string[]>([]);

    // Extract unique wallets
    const allWallets = useMemo(() => {
        const wallets = new Set<string>();
        transactions.forEach(tx => {
            if (tx.wallet?.name) wallets.add(tx.wallet.name);
        });
        return Array.from(wallets).sort();
    }, [transactions]);

    // Initialize selected wallets on mount or when wallets change
    useEffect(() => {
        if (allWallets.length > 0 && selectedWallets.length === 0) {
            setSelectedWallets(allWallets);
        }
    }, [allWallets]);

    const toggleWallet = (wallet: string) => {
        setSelectedWallets(prev =>
            prev.includes(wallet)
                ? prev.filter(w => w !== wallet)
                : [...prev, wallet]
        );
    };

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                let daysParam: string | number = days;

                // Calculate custom "ALL" range based on earliest transaction
                if (days === 'max') {
                    if (transactions.length > 0) {
                        const timestamps = transactions.map(t => new Date(t.timestamp).getTime());
                        const earliestTimestamp = Math.min(...timestamps);
                        const msPerDay = 1000 * 60 * 60 * 24;
                        const daysSinceFirstBuy = Math.ceil((Date.now() - earliestTimestamp) / msPerDay);
                        // Add 14 days buffer before first buy for context
                        daysParam = daysSinceFirstBuy + 14;
                    } else {
                        // Fallback if no transactions
                        daysParam = 365;
                    }
                }

                // Fetch daily data for the selected range
                const res = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${daysParam}&interval=daily`);
                if (!res.ok) throw new Error("Failed to fetch price data");

                const data = await res.json();
                const prices = data.prices.map(([timestamp, price]: [number, number]) => ({
                    date: timestamp,
                    price: price,
                    formattedDate: format(new Date(timestamp), 'MMM dd')
                }));

                setPriceData(prices);
            } catch (err) {
                console.error("Chart data fetch error:", err);
                setError("Could not load price history.");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [days, transactions]);

    // Prepare transaction markers
    const markers = useMemo(() => {
        if (!priceData.length) return [];

        const minDate = priceData[0].date;

        return transactions.filter(tx => {
            const txTime = new Date(tx.timestamp).getTime();
            const walletName = tx.wallet?.name;
            const isWalletSelected = walletName ? selectedWallets.includes(walletName) : true;
            return txTime >= minDate && isWalletSelected;
        }).map(tx => ({
            ...tx,
            date: new Date(tx.timestamp).getTime(),
            formattedDate: format(new Date(tx.timestamp), 'MMM dd HH:mm'),
        }));
    }, [transactions, priceData]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg">
                    <p className="text-faint text-xs mb-1">{format(new Date(label), 'MMM dd, yyyy')}</p>
                    <p className="text-foreground font-medium text-sm font-num">
                        {formatCurrency(payload[0].value)}
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card className="p-6 relative overflow-hidden h-full flex flex-col">
            <div className="flex justify-between items-center mb-5">
                <div>
                    <h3 className="text-sm font-medium text-foreground">
                        Price history
                    </h3>
                    <p className="text-xs text-faint mt-0.5">
                        Bitcoin price with your purchase points
                    </p>
                </div>
                <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                    {[30, 90, 'max'].map(d => (
                        <button
                            key={d}
                            onClick={() => setDays(d as number | 'max')}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${days === d ? 'bg-primary text-black' : 'text-muted hover:text-foreground'
                                }`}
                        >
                            {d === 'max' ? 'ALL' : `${d}D`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Wallet Filters */}
            {allWallets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-5">
                    {allWallets.map(wallet => (
                        <button
                            key={wallet}
                            onClick={() => toggleWallet(wallet)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${selectedWallets.includes(wallet)
                                ? 'bg-primary/10 text-primary border-primary/30'
                                : 'bg-transparent text-faint border-border hover:border-border-strong'
                                }`}
                        >
                            {wallet}
                        </button>
                    ))}
                </div>
            )}

            <div className="h-[280px] w-full flex-1">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : error ? (
                    <div className="h-full flex items-center justify-center text-red-400 gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">{error}</span>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceData}>
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
                                width={50}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                            <Line
                                type="monotone"
                                dataKey="price"
                                stroke="#d6a24c"
                                strokeWidth={1.5}
                                dot={false}
                                activeDot={{ r: 3, fill: '#d6a24c', strokeWidth: 0 }}
                            />

                            {/* Render Buy Points as Reference Dots */}
                            {markers.map((tx) => (
                                <ReferenceDot
                                    key={tx.id}
                                    x={tx.date}
                                    y={tx.priceAtTime}
                                    r={3.5}
                                    fill="#52c98a"
                                    stroke="none"
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-0.5 bg-primary" />
                    <span className="text-faint">BTC price</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span className="text-faint">Your buys</span>
                </div>
            </div>
        </Card>
    );
}
