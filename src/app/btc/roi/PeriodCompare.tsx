"use client";

import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, cn } from "@/components/ui/core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Tx {
    amount: number;
    priceAtTime: number;
    timestamp: string | Date;
    wallet?: { name?: string | null } | null;
}

interface Bucket {
    invested: number;
    btc: number;
    wallets: Map<string, { invested: number; btc: number }>;
}

const usd = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const tone = (v: number) => (v >= 0 ? "text-emerald-500" : "text-red-400");

export default function PeriodCompare({ transactions, currentPrice }: { transactions: Tx[]; currentPrice: number }) {
    const [mode, setMode] = useState<"month" | "year">("month");

    // year -> month(0-11) -> bucket, plus year totals
    const { byYearMonth, byYear, years, walletNames } = useMemo(() => {
        const ym = new Map<string, Bucket>(); // "2026-09"
        const y = new Map<string, Bucket>(); // "2026"
        const names = new Set<string>();
        const add = (map: Map<string, Bucket>, key: string, wallet: string, amount: number, invested: number) => {
            const b = map.get(key) ?? { invested: 0, btc: 0, wallets: new Map() };
            b.invested += invested;
            b.btc += amount;
            const w = b.wallets.get(wallet) ?? { invested: 0, btc: 0 };
            w.invested += invested;
            w.btc += amount;
            b.wallets.set(wallet, w);
            map.set(key, b);
        };
        for (const tx of transactions) {
            const iso = new Date(tx.timestamp).toISOString();
            const wallet = tx.wallet?.name || "—";
            names.add(wallet);
            const invested = tx.amount * tx.priceAtTime;
            add(ym, iso.slice(0, 7), wallet, tx.amount, invested);
            add(y, iso.slice(0, 4), wallet, tx.amount, invested);
        }
        return {
            byYearMonth: ym,
            byYear: y,
            years: Array.from(y.keys()).sort(),
            walletNames: Array.from(names).sort(),
        };
    }, [transactions]);

    // Default month: the latest month that has data in at least two different years, else the latest month with data.
    const defaultMonth = useMemo(() => {
        const counts = new Array(12).fill(0);
        let latest = new Date().getUTCMonth();
        const keys = Array.from(byYearMonth.keys()).sort();
        for (const k of keys) {
            counts[parseInt(k.slice(5, 7), 10) - 1]++;
        }
        if (keys.length) latest = parseInt(keys[keys.length - 1].slice(5, 7), 10) - 1;
        return counts[latest] >= 2 ? latest : (counts.findIndex((c) => c >= 2) >= 0 ? counts.findIndex((c) => c >= 2) : latest);
    }, [byYearMonth]);
    const [month, setMonth] = useState<number | null>(null);
    const m = month ?? defaultMonth;

    const columns = useMemo(() => {
        const cols: { label: string; sub: string; bucket: Bucket }[] = [];
        if (mode === "month") {
            for (const yr of years) {
                const key = `${yr}-${String(m + 1).padStart(2, "0")}`;
                const b = byYearMonth.get(key);
                if (b) cols.push({ label: `${MONTHS[m]} ${yr}`, sub: yr, bucket: b });
            }
        } else {
            for (const yr of years) {
                const b = byYear.get(yr);
                if (b) cols.push({ label: yr, sub: yr, bucket: b });
            }
        }
        return cols.map((c) => {
            const valueNow = c.bucket.btc * currentPrice;
            return {
                ...c,
                valueNow,
                pnl: valueNow - c.bucket.invested,
                roi: c.bucket.invested > 0 ? ((valueNow - c.bucket.invested) / c.bucket.invested) * 100 : 0,
                avgPrice: c.bucket.btc > 0 ? c.bucket.invested / c.bucket.btc : 0,
            };
        });
    }, [mode, m, years, byYearMonth, byYear, currentPrice]);

    const chartData = columns.map((c) => ({ name: c.label, Investit: Math.round(c.bucket.invested), "Valoare acum": Math.round(c.valueNow) }));

    return (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-sm font-medium text-foreground">Comparație perioade &middot; Bitcoin</h3>
                    <p className="text-xs text-muted mt-0.5">
                        {mode === "month"
                            ? `Aceeași lună (${MONTHS[m]}) în ani diferiți — ce am investit și cât valorează acum`
                            : "Anii unul lângă altul — ce am investit și cât valorează acum"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {mode === "month" && (
                        <select
                            value={m}
                            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                            className="bg-white/[0.03] border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
                        >
                            {MONTHS.map((name, i) => (
                                <option key={name} value={i} className="bg-black">{name}</option>
                            ))}
                        </select>
                    )}
                    <div className="flex bg-white/[0.03] border border-border rounded-lg p-0.5">
                        {(["month", "year"] as const).map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setMode(g)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                    mode === g ? "bg-primary text-black" : "text-muted hover:text-foreground"
                                )}
                            >
                                {g === "month" ? "Lună" : "An"}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {columns.length === 0 ? (
                <p className="text-muted text-sm py-6 text-center">Nicio investiție în această perioadă.</p>
            ) : (
                <div className="space-y-6">
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(columns.length, 4)}, minmax(0, 1fr))` }}>
                        {columns.map((c, i) => {
                            const prev = i > 0 ? columns[i - 1] : null;
                            const investDelta = prev && prev.bucket.invested > 0 ? ((c.bucket.invested - prev.bucket.invested) / prev.bucket.invested) * 100 : null;
                            return (
                                <div key={c.label} className="rounded-xl border border-border bg-white/[0.02] p-4">
                                    <p className="text-sm font-medium text-foreground mb-3">{c.label}</p>
                                    <p className="text-[11px] text-muted uppercase tracking-wider">Investit</p>
                                    <p className="text-xl font-medium text-foreground">{usd(c.bucket.invested)}</p>
                                    {investDelta !== null && (
                                        <p className={cn("text-xs", tone(investDelta))}>{pct(investDelta)} față de {prev!.label}</p>
                                    )}
                                    <div className="mt-3 pt-3 border-t border-border space-y-1 text-sm">
                                        <div className="flex justify-between"><span className="text-muted">BTC</span><span className="text-foreground font-mono">{c.bucket.btc.toFixed(6)}</span></div>
                                        <div className="flex justify-between"><span className="text-muted">Preț mediu</span><span className="text-foreground font-mono">{usd(c.avgPrice)}</span></div>
                                        <div className="flex justify-between"><span className="text-muted">Valoare acum</span><span className="text-foreground font-mono">{usd(c.valueNow)}</span></div>
                                        <div className="flex justify-between"><span className="text-muted">P&amp;L</span><span className={cn("font-mono", tone(c.pnl))}>{c.pnl >= 0 ? "+" : "-"}{usd(Math.abs(c.pnl))} ({pct(c.roi)})</span></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {columns.length > 1 && (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => usd(v as number)} width={70} />
                                    <Tooltip formatter={(v) => usd(Number(v))} contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="Investit" fill="#6b7280" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Valoare acum" fill="#d9a441" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Per wallet segment */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted uppercase tracking-wider border-b border-border">
                                    <th className="py-2 pr-4 font-medium">Portofel</th>
                                    {columns.map((c) => (
                                        <th key={c.label} className="py-2 px-3 font-medium text-right">{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {walletNames.map((name) => {
                                    if (!columns.some((c) => c.bucket.wallets.has(name))) return null;
                                    return (
                                        <tr key={name}>
                                            <td className="py-2 pr-4 text-foreground">{name}</td>
                                            {columns.map((c) => {
                                                const w = c.bucket.wallets.get(name);
                                                if (!w) return <td key={c.label} className="py-2 px-3 text-right text-faint">—</td>;
                                                const val = w.btc * currentPrice;
                                                const r = w.invested > 0 ? ((val - w.invested) / w.invested) * 100 : 0;
                                                return (
                                                    <td key={c.label} className="py-2 px-3 text-right font-mono">
                                                        <span className="text-muted">{usd(w.invested)}</span>
                                                        <span className="text-faint"> → </span>
                                                        <span className="text-foreground">{usd(val)}</span>
                                                        <span className={cn("ml-1 text-xs", tone(r))}>{pct(r)}</span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-muted">Valoarea „acum” = BTC cumpărat în acea perioadă × prețul curent. Valori în USD.</p>
                </div>
            )}
        </Card>
    );
}
