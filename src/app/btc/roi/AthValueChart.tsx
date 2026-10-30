"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/core";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Transaction {
    amount: number;
    priceAtTime: number;
    timestamp: string | Date;
}

interface Props {
    transactions: Transaction[];
    athPrice: number;
    athDate: string | null;
}

interface Row {
    date: number;
    invested: number;
    value: number;
    atAth: number;
}

const usd = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

const SERIES = [
    { key: "invested", label: "Investit", color: "#8c8a80" },
    { key: "value", label: "Valoare la prețul zilei", color: "#22c55e" },
    { key: "atAth", label: "Dacă BTC ar fi la ATH", color: "#f59e0b" },
] as const;

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;
    return (
        <div className="bg-surface-strong border border-border px-3 py-2 rounded-lg space-y-1 min-w-[190px]">
            <p className="text-faint text-xs mb-1">{format(new Date(row.date), "MMM dd, yyyy")}</p>
            {SERIES.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-faint flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                        {s.label}
                    </span>
                    <span className="text-xs font-num font-medium text-foreground">{usd(row[s.key])}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * For every day since the first purchase: what you had put in, what the BTC
 * held that day was worth at that day's price, and what that same BTC would
 * be worth at the all-time-high price. The gap between the amber and green
 * lines is the room left to the last ATH.
 */
export default function AthValueChart({ transactions, athPrice, athDate }: Props) {
    const [prices, setPrices] = useState<{ date: number; price: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const sorted = useMemo(
        () => [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
        [transactions]
    );
    const earliest = sorted.length > 0 ? new Date(sorted[0].timestamp).getTime() : null;

    useEffect(() => {
        let cancelled = false;
        async function run() {
            if (earliest === null) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(false);
            try {
                const days = Math.ceil((Date.now() - earliest) / 86_400_000) + 2;
                const res = await fetch(`/api/btc/price-history?days=${days}`);
                if (!res.ok) throw new Error("price history failed");
                const data = await res.json();
                const pts = (data.prices as [number, number][]).map(([date, price]) => ({ date, price }));
                if (!cancelled) setPrices(pts);
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
    }, [earliest]);

    const data = useMemo((): Row[] => {
        if (earliest === null) return [];
        return prices
            .filter((p) => p.date >= earliest)
            .map(({ date, price }) => {
                let btc = 0;
                let invested = 0;
                for (const t of sorted) {
                    if (new Date(t.timestamp).getTime() > date) break;
                    btc += t.amount;
                    invested += t.amount * t.priceAtTime;
                }
                return { date, invested, value: btc * price, atAth: btc * athPrice };
            });
    }, [prices, sorted, earliest, athPrice]);

    const latest = data.length > 0 ? data[data.length - 1] : null;

    if (sorted.length === 0) return null;

    return (
        <Card className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div>
                    <h3 className="text-sm font-medium text-foreground">Valoarea investiției la ultimul ATH</h3>
                    <p className="text-xs text-faint mt-0.5">
                        BTC-ul deținut în fiecare zi, evaluat la prețul ATH ({usd(athPrice)}
                        {athDate ? `, ${format(new Date(athDate), "d MMM yyyy")}` : ""}) față de prețul real al zilei
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0">
                    {SERIES.map((s) => (
                        <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                            {s.label}
                            {latest && <span className="font-num font-medium text-foreground">{usd(latest[s.key])}</span>}
                        </span>
                    ))}
                </div>
            </div>

            {data.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-muted text-sm">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : error ? "Nu s-a putut încărca istoricul de preț." : "Încă nu sunt destule date."}
                </div>
            ) : (
                <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data}>
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
                                tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                                width={64}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.12)" }} />
                            <Area type="monotone" dataKey="atAth" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" fill="#f59e0b" fillOpacity={0.08} dot={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
                            <Line type="stepAfter" dataKey="invested" stroke="#8c8a80" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
