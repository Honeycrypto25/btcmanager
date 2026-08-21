"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, cn } from "@/components/ui/core";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Transaction {
    amount: number;
    priceAtTime: number;
    timestamp: string | Date;
}

interface RoiEvolutionChartProps {
    transactions: Transaction[];
    usdToGbp: number;
}

type Mode = "percent" | "usd" | "gbp";

interface PricePoint {
    date: number;
    price: number;
}

interface ChartRow {
    date: number;
    roiPercentage: number;
    roiUsd: number;
    roiGbp: number;
}

function formatUsd(val: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function formatGbp(val: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(val);
}

function valueForMode(row: ChartRow, mode: Mode): number {
    if (mode === "percent") return row.roiPercentage;
    if (mode === "usd") return row.roiUsd;
    return row.roiGbp;
}

function formatForMode(value: number, mode: Mode): string {
    if (mode === "percent") return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
    if (mode === "usd") return `${value >= 0 ? "+" : ""}${formatUsd(value)}`;
    return `${value >= 0 ? "+" : ""}${formatGbp(value)}`;
}

/** Defined at module scope so it isn't recreated on every render. */
function CustomTooltip({ active, payload, mode }: { active?: boolean; payload?: { payload: ChartRow }[]; mode: Mode }) {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;
    const value = valueForMode(row, mode);
    return (
        <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg space-y-1 min-w-[150px]">
            <p className="text-faint text-xs mb-1">{format(new Date(row.date), "MMM dd, yyyy")}</p>
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-faint">ROI</span>
                <span className={cn("text-xs font-num font-medium", value >= 0 ? "text-green-500" : "text-red-500")}>
                    {formatForMode(value, mode)}
                </span>
            </div>
        </div>
    );
}

/**
 * How ROI actually moved over time, not just where each monthly cohort
 * stands today. Uses the real historical BTC/USD price (CoinGecko daily
 * candles, same source/pattern as AvgCostChart on /btc/analytics) combined
 * with the running cumulative invested/BTC-held from every transaction up
 * to each day, so the line reflects the true value of the WHOLE portfolio
 * as it existed on that date — unlike the Monthly Breakdown table, which
 * values every period's BTC at today's price only.
 */
export default function RoiEvolutionChart({ transactions, usdToGbp }: RoiEvolutionChartProps) {
    const [mode, setMode] = useState<Mode>("percent");
    const [marketPrice, setMarketPrice] = useState<PricePoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const sorted = useMemo(
        () => [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
        [transactions]
    );
    const earliestTxTime = sorted.length > 0 ? new Date(sorted[0].timestamp).getTime() : null;

    useEffect(() => {
        let cancelled = false;
        async function run() {
            if (earliestTxTime === null) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(false);
            try {
                const days = Math.ceil((Date.now() - earliestTxTime) / (1000 * 60 * 60 * 24)) + 2;
                const res = await fetch(
                    `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`
                );
                if (!res.ok) throw new Error("Failed to fetch price data");
                const data = await res.json();
                const prices: PricePoint[] = data.prices.map(([ts, price]: [number, number]) => ({ date: ts, price }));
                if (!cancelled) setMarketPrice(prices);
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        run();
        return () => {
            cancelled = true;
        };
    }, [earliestTxTime]);

    const chartData = useMemo((): ChartRow[] => {
        if (sorted.length === 0 || earliestTxTime === null) return [];
        return marketPrice
            .filter((p) => p.date >= earliestTxTime)
            .map(({ date, price }) => {
                const upToHere = sorted.filter((t) => new Date(t.timestamp).getTime() <= date);
                const cumBtc = upToHere.reduce((s, t) => s + t.amount, 0);
                const cumInvested = upToHere.reduce((s, t) => s + t.amount * t.priceAtTime, 0);
                const currentValue = cumBtc * price;
                const roiUsd = currentValue - cumInvested;
                const roiPercentage = cumInvested > 0 ? (roiUsd / cumInvested) * 100 : 0;
                return { date, roiPercentage, roiUsd, roiGbp: roiUsd * usdToGbp };
            });
    }, [sorted, marketPrice, earliestTxTime, usdToGbp]);

    const modeOptions: { key: Mode; label: string }[] = [
        { key: "percent", label: "%" },
        { key: "usd", label: "$" },
        { key: "gbp", label: "£" },
    ];

    const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;

    if (sorted.length === 0) {
        return (
            <Card className="p-6">
                <h3 className="text-sm font-medium text-foreground mb-1">ROI evolution</h3>
                <div className="h-[280px] flex items-center justify-center text-muted text-sm">No purchases yet.</div>
            </Card>
        );
    }

    return (
        <Card className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div>
                    <h3 className="text-sm font-medium text-foreground">ROI evolution</h3>
                    <p className="text-xs text-faint mt-0.5">
                        True portfolio ROI on each day, using that day&apos;s real BTC price — not today&apos;s
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {latest && (
                        <span className={cn("text-sm font-medium font-num", valueForMode(latest, mode) >= 0 ? "text-green-500" : "text-red-500")}>
                            {formatForMode(valueForMode(latest, mode), mode)}
                        </span>
                    )}
                    <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                        {modeOptions.map((opt) => (
                            <button
                                key={opt.key}
                                onClick={() => setMode(opt.key)}
                                className={cn(
                                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                                    mode === opt.key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {chartData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-muted text-sm">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : error ? "Could not load price history." : "Not enough data yet."}
                </div>
            ) : (
                <div className="h-[280px] w-full relative">
                    {loading && (
                        <div className="absolute top-0 right-0 z-10">
                            <Loader2 className="w-3.5 h-3.5 text-faint animate-spin" />
                        </div>
                    )}
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(tick) => format(new Date(tick), "MMM dd")}
                                stroke="rgba(255,255,255,0.08)"
                                tick={{ fontSize: 10, fill: "#565550" }}
                                minTickGap={30}
                                type="number"
                                domain={["dataMin", "dataMax"]}
                                scale="time"
                                tickLine={false}
                            />
                            <YAxis
                                stroke="rgba(255,255,255,0.08)"
                                tick={{ fontSize: 10, fill: "#565550" }}
                                tickFormatter={(val) => (mode === "percent" ? `${val.toFixed(0)}%` : mode === "usd" ? `$${val.toLocaleString()}` : `£${val.toLocaleString()}`)}
                                width={56}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip mode={mode} />} cursor={{ stroke: "rgba(255,255,255,0.12)" }} />
                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                            <Line
                                type="monotone"
                                dataKey={mode === "percent" ? "roiPercentage" : mode === "usd" ? "roiUsd" : "roiGbp"}
                                stroke="#52c98a"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
