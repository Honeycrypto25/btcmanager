
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
    ReferenceDot,
    ReferenceLine
} from 'recharts';
import { Card } from "@/components/ui/core";
import { Loader2, TrendingUp, AlertCircle } from "lucide-react";
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
    const [days, setDays] = useState(30);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                // Fetch daily data for the selected range
                const res = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`);
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
    }, [days]);

    // Prepare transaction markers
    const markers = useMemo(() => {
        if (!priceData.length) return [];

        const minDate = priceData[0].date;

        return transactions.filter(tx => {
            const txTime = new Date(tx.timestamp).getTime();
            return txTime >= minDate;
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
                <div className="bg-[#101010] border border-white/10 p-3 rounded-xl shadow-xl">
                    <p className="text-gray-400 text-xs mb-1">{format(new Date(label), 'MMM dd, yyyy')}</p>
                    <p className="text-white font-bold text-sm">
                        Price: <span className="text-primary">{formatCurrency(payload[0].value)}</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    // Custom Dot for Transactions
    const renderCustomDot = (props: any) => {
        const { cx, cy, payload } = props;
        // Check if there's a transaction close to this point? 
        // Actually ReferenceDot is better for specific disconnected points.
        return null;
    };

    return (
        <Card className="p-6 border-white/5 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        Buy Frequency
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">
                        Bitcoin price with your purchase points overlay.
                    </p>
                </div>
                <div className="flex bg-glass border border-white/5 rounded-xl p-1">
                    {[30, 90].map(d => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${days === d ? 'bg-primary text-black' : 'text-gray-500 hover:text-white'
                                }`}
                        >
                            {d}D
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-[300px] w-full">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : error ? (
                    <div className="h-full flex items-center justify-center text-red-500 gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">{error}</span>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(tick) => format(new Date(tick), 'MMM dd')}
                                stroke="#555"
                                tick={{ fontSize: 10, fill: '#666' }}
                                minTickGap={30}
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                scale="time"
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                stroke="#555"
                                tick={{ fontSize: 10, fill: '#666' }}
                                tickFormatter={(val) => `$${val.toLocaleString()}`}
                                width={50}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#ffffff20' }} />
                            <Line
                                type="monotone"
                                dataKey="price"
                                stroke="#F7931A"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, fill: '#fff' }}
                            />

                            {/* Render Buy Points as Reference Dots */}
                            {markers.map((tx) => (
                                <ReferenceDot
                                    key={tx.id}
                                    x={tx.date}
                                    y={tx.priceAtTime}
                                    r={6}
                                    fill="#22c55e"
                                    stroke="#fff"
                                    strokeWidth={2}
                                >
                                    {/* <Label 
                                        value="BUY" 
                                        position="top" 
                                        fill="#22c55e" 
                                        fontSize={10} 
                                        fontWeight="bold"
                                        offset={10}
                                    /> */}
                                </ReferenceDot>
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#F7931A]" />
                    <span className="text-gray-400">BTC Price</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 border border-white" />
                    <span className="text-gray-400">Your Buys</span>
                </div>
            </div>
        </Card>
    );
}
