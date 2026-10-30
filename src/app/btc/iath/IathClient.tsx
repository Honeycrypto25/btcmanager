"use client";

import React, { useMemo, useState } from "react";
import { Card, cn } from "@/components/ui/core";
import { Target } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import AthValueChart from "./AthValueChart";

export interface IathPeriod {
    key: string;
    label: string;
    invested: number;
    btc: number;
    valueNow: number;
    valueAtAth: number;
}

interface Props {
    ath: { price: number; date: string | null } | null;
    currentPrice: number;
    totals: { invested: number; btc: number };
    monthly: IathPeriod[]; // oldest first
    yearly: IathPeriod[];
    transactions: { amount: number; priceAtTime: number; timestamp: string }[];
}

const usd = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const btcFmt = (v: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 }).format(v);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const BARS = [
    { key: "invested", label: "Investit", color: "#8c8a80" },
    { key: "valueNow", label: "Valoare acum", color: "#22c55e" },
    { key: "valueAtAth", label: "La ATH", color: "#f59e0b" },
] as const;

export default function IathClient({ ath, currentPrice, totals, monthly, yearly, transactions }: Props) {
    const [granularity, setGranularity] = useState<"month" | "year">("month");
    const periods = granularity === "year" ? yearly : monthly;
    const valueNow = totals.btc * currentPrice;

    // Chart: the latest 12 periods, oldest -> newest.
    const chartRows = useMemo(() => periods.slice(-12), [periods]);

    // Average per month / year (whichever is selected) over ALL periods with data.
    const averages = useMemo(() => {
        const n = periods.length;
        if (n === 0) return null;
        return {
            invested: periods.reduce((s, p) => s + p.invested, 0) / n,
            atAth: periods.reduce((s, p) => s + p.valueAtAth, 0) / n,
            count: n,
        };
    }, [periods]);

    if (!ath || totals.btc <= 0) {
        return (
            <div className="space-y-6">
                <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
                    <span className="gradient-text">iATH</span> · Investment ATH
                </h1>
                <Card className="p-6 text-sm text-muted">
                    {totals.btc <= 0 ? "Nicio achiziție de BTC înregistrată încă." : "Nu am putut afla prețul ATH acum. Încearcă din nou mai târziu."}
                </Card>
            </div>
        );
    }

    const totalAtAth = totals.btc * ath.price;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                    <span className="gradient-text">iATH</span> · Investment ATH
                </h1>
                <p className="text-muted text-sm">Cât ar valora investițiile tale în BTC la prețul ultimului ATH.</p>
            </div>

            {/* Total */}
            <Card className="p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Target className="w-24 h-24 text-orange-500" />
                </div>
                <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Portofoliu la ultimul ATH</p>
                <p className="text-3xl font-medium text-foreground">{usd(totalAtAth)}</p>
                <p className="text-xs text-muted mt-1 font-mono">
                    {btcFmt(totals.btc)} BTC × {usd(ath.price)}
                    {ath.date ? ` · ATH ${format(new Date(ath.date), "MMM d, yyyy")}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span className="text-muted">
                        Investit: <span className="font-num font-medium text-foreground">{usd(totals.invested)}</span>
                    </span>
                    <span className="text-muted">
                        Valoare acum: <span className="font-num font-medium text-foreground">{usd(valueNow)}</span>
                    </span>
                    <span className="text-muted">
                        Față de acum:{" "}
                        <span className="font-num font-medium text-green-500">
                            +{usd(totalAtAth - valueNow)} ({pct(valueNow > 0 ? (totalAtAth / valueNow - 1) * 100 : 0)})
                        </span>
                    </span>
                    <span className="text-muted">
                        Față de investit:{" "}
                        <span className="font-num font-medium text-foreground">
                            {pct(totals.invested > 0 ? (totalAtAth / totals.invested - 1) * 100 : 0)}
                        </span>
                    </span>
                    <span className="text-muted">
                        Preț actual vs ATH:{" "}
                        <span className="font-num font-medium text-foreground">{pct((currentPrice / ath.price - 1) * 100)}</span>
                    </span>
                </div>
            </Card>

            {/* Time series */}
            <AthValueChart transactions={transactions} athPrice={ath.price} athDate={ath.date} />

            {/* Per month / year */}
            <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                        <h3 className="text-sm font-medium text-foreground">
                            Investiții pe {granularity === "year" ? "ani" : "luni"} și valoarea la ATH
                        </h3>
                        <p className="text-xs text-faint mt-0.5">
                            Fiecare perioadă: cât ai investit, cât valorează BTC-ul cumpărat atunci azi și la prețul ATH
                        </p>
                    </div>
                    <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                        {(["month", "year"] as const).map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setGranularity(g)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                    granularity === g ? "bg-primary text-black" : "text-muted hover:text-foreground"
                                )}
                            >
                                {g === "month" ? "Luni" : "Ani"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Bar chart */}
                <div className="h-[280px] w-full mb-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#565550" }} stroke="rgba(255,255,255,0.08)" tickLine={false} />
                            <YAxis
                                tick={{ fontSize: 10, fill: "#565550" }}
                                stroke="rgba(255,255,255,0.08)"
                                tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                                width={64}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => usd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {averages && (
                                <ReferenceLine
                                    y={averages.invested}
                                    stroke="#c9c6ba"
                                    strokeDasharray="6 4"
                                    strokeWidth={1.5}
                                    ifOverflow="extendDomain"
                                    label={{ value: `Medie investit ${usd(averages.invested)}`, position: "insideTopLeft", fill: "#c9c6ba", fontSize: 10 }}
                                />
                            )}
                            {averages && (
                                <ReferenceLine
                                    y={averages.atAth}
                                    stroke="#f59e0b"
                                    strokeDasharray="6 4"
                                    strokeWidth={1.5}
                                    ifOverflow="extendDomain"
                                    label={{ value: `Medie la ATH ${usd(averages.atAth)}`, position: "insideTopLeft", fill: "#f59e0b", fontSize: 10 }}
                                />
                            )}
                            {BARS.map((b) => (
                                <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {averages && (
                    <p className="text-[10px] text-faint mb-1">
                        Liniile punctate = media pe {granularity === "year" ? "an" : "lună"} (din toate cele {averages.count}{" "}
                        {granularity === "year" ? "ani" : "luni"} cu investiții): investit {usd(averages.invested)}, la ATH {usd(averages.atAth)}.
                    </p>
                )}
                {periods.length > chartRows.length && (
                    <p className="text-[10px] text-faint mb-4">Graficul arată ultimele 12 perioade; lista de mai jos le include pe toate.</p>
                )}

                {/* List, newest first */}
                <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))_minmax(48px,auto)] gap-x-3 pb-1.5 border-b border-border">
                    <span />
                    <span className="text-[10px] text-faint uppercase tracking-wider text-right">Investit</span>
                    <span className="text-[10px] text-faint uppercase tracking-wider text-right">Acum</span>
                    <span className="text-[10px] text-faint uppercase tracking-wider text-right">La ATH</span>
                    <span className="text-[10px] text-faint uppercase tracking-wider text-right">×</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto pr-1">
                    {[...periods].reverse().map((p) => (
                        <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))_minmax(48px,auto)] gap-x-3 items-baseline py-2.5 border-b border-border last:border-0">
                            <div className="min-w-0">
                                <span className="text-sm font-medium text-foreground">{p.label}</span>
                                <span className="ml-2 text-[10px] text-faint font-mono">{btcFmt(p.btc)} BTC</span>
                            </div>
                            <span className="text-sm font-num text-foreground text-right">{usd(p.invested)}</span>
                            <span className={cn("text-sm font-num text-right", p.valueNow >= p.invested ? "text-accent" : "text-red-400")}>{usd(p.valueNow)}</span>
                            <span className="text-sm font-num font-medium text-amber-400 text-right">{usd(p.valueAtAth)}</span>
                            <span className="text-xs font-num text-muted text-right">
                                {p.invested > 0 ? `${(p.valueAtAth / p.invested).toFixed(2)}×` : "—"}
                            </span>
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-faint mt-3">
                    „×” = valoarea la ATH împărțită la suma investită în acea perioadă. Valorile folosesc prețul actual și prețul ATH.
                </p>
            </Card>
        </div>
    );
}
