"use client";

import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, cn } from "@/components/ui/core";
import type { ComparisonSeries } from "@/lib/overview-data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

type Cell = { invested: number; value: number };

export function ComparisonCard({
    series,
    factor,
    fmt,
    pnlColor,
}: {
    series: ComparisonSeries[];
    factor: number;
    fmt: (n: number) => string;
    pnlColor: (n: number) => string;
}) {
    const [mode, setMode] = useState<"month" | "year">("month");
    const [month, setMonth] = useState<number | null>(null);
    const [hidden, setHidden] = useState<string[]>([]);

    const visible = useMemo(() => series.filter((s) => !hidden.includes(s.id)), [series, hidden]);

    // Cohorts per series: key = "YYYY-MM" or "YYYY"
    const cohorts = useMemo(() => {
        const out = new Map<string, { month: Map<string, Cell>; year: Map<string, Cell> }>();
        for (const s of series) {
            const mm = new Map<string, Cell>();
            const yy = new Map<string, Cell>();
            for (const r of s.months) {
                const add = (map: Map<string, Cell>, k: string) => {
                    const c = map.get(k) ?? { invested: 0, value: 0 };
                    map.set(k, { invested: c.invested + r.invested * factor, value: c.value + r.value * factor });
                };
                add(mm, r.key);
                add(yy, r.key.slice(0, 4));
            }
            out.set(s.id, { month: mm, year: yy });
        }
        return out;
    }, [series, factor]);

    const years = useMemo(() => {
        const set = new Set<string>();
        for (const s of series) for (const r of s.months) set.add(r.key.slice(0, 4));
        return Array.from(set).sort();
    }, [series]);

    const defaultMonth = useMemo(() => {
        const yearsPerMonth: Set<string>[] = Array.from({ length: 12 }, () => new Set());
        let latest = -1;
        let latestKey = "";
        for (const s of series) {
            for (const r of s.months) {
                yearsPerMonth[parseInt(r.key.slice(5, 7), 10) - 1].add(r.key.slice(0, 4));
                if (r.key > latestKey) { latestKey = r.key; latest = parseInt(r.key.slice(5, 7), 10) - 1; }
            }
        }
        if (latest >= 0 && yearsPerMonth[latest].size >= 2) return latest;
        const multi = yearsPerMonth.findIndex((s) => s.size >= 2);
        return multi >= 0 ? multi : Math.max(latest, 0);
    }, [series]);
    const m = month ?? defaultMonth;

    // Columns = periods that have data in at least one visible series
    const columns = useMemo(() => {
        const cols: { label: string; key: string }[] = [];
        for (const yr of years) {
            const key = mode === "month" ? `${yr}-${String(m + 1).padStart(2, "0")}` : yr;
            const has = visible.some((s) => {
                const c = cohorts.get(s.id)?.[mode === "month" ? "month" : "year"].get(key);
                return !!c && (c.invested !== 0 || c.value !== 0);
            });
            if (has) cols.push({ key, label: mode === "month" ? `${MONTHS[m]} ${yr}` : yr });
        }
        return cols;
    }, [years, mode, m, visible, cohorts]);

    const cell = (id: string, key: string): Cell | undefined => cohorts.get(id)?.[mode === "month" ? "month" : "year"].get(key);

    const totals = columns.map((c) => {
        let invested = 0;
        let value = 0;
        for (const s of visible) {
            const x = cell(s.id, c.key);
            if (x) { invested += x.invested; value += x.value; }
        }
        return { ...c, invested, value };
    });

    const chartData = totals.map((t) => ({ name: t.label, Investit: Math.round(t.invested), "Valoare acum": Math.round(t.value) }));

    if (series.length === 0) return null;

    const renderCell = (x: Cell | undefined) => {
        if (!x || (x.invested === 0 && x.value === 0)) return <span className="text-faint">—</span>;
        const r = x.invested > 0 ? ((x.value - x.invested) / x.invested) * 100 : 0;
        return (
            <span className="font-mono whitespace-nowrap">
                <span className="text-muted">{fmt(x.invested)}</span>
                <span className="text-faint"> → </span>
                <span className="text-foreground">{fmt(x.value)}</span>
                <span className={cn("ml-1 text-xs", pnlColor(r))}>{pct(r)}</span>
            </span>
        );
    };

    return (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-sm font-medium text-foreground">Comparație perioade &middot; toate investițiile</h3>
                    <p className="text-xs text-muted mt-0.5">
                        {mode === "month" ? `Aceeași lună (${MONTHS[m]}) în ani diferiți` : "Anii unul lângă altul"} — investit → valoare acum, pe fiecare investiție / cont
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
                                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", mode === g ? "bg-primary text-black" : "text-muted hover:text-foreground")}
                            >
                                {g === "month" ? "Lună" : "An"}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Which investments are included */}
            <div className="flex flex-wrap gap-2 mb-4">
                {series.map((s) => {
                    const on = !hidden.includes(s.id);
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setHidden((h) => (on ? [...h, s.id] : h.filter((x) => x !== s.id)))}
                            className={cn(
                                "px-3 py-1 rounded-full text-xs border transition-colors",
                                on ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-faint hover:text-muted"
                            )}
                        >
                            {s.name}
                        </button>
                    );
                })}
            </div>

            {columns.length === 0 ? (
                <p className="text-muted text-sm py-6 text-center">Nicio investiție în această perioadă.</p>
            ) : (
                <div className="space-y-6">
                    {columns.length > 1 && (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => fmt(v as number)} width={70} />
                                    <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="Investit" fill="#6b7280" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Valoare acum" fill="#d9a441" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted uppercase tracking-wider border-b border-border">
                                    <th className="py-2 pr-4 font-medium">Investiție</th>
                                    {columns.map((c) => (
                                        <th key={c.key} className="py-2 px-3 font-medium text-right">{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {visible.map((s) => (
                                    <tr key={s.id}>
                                        <td className="py-2 pr-4 text-foreground">{s.name}</td>
                                        {columns.map((c) => (
                                            <td key={c.key} className="py-2 px-3 text-right">{renderCell(cell(s.id, c.key))}</td>
                                        ))}
                                    </tr>
                                ))}
                                {visible.length > 1 && (
                                    <tr className="border-t border-border">
                                        <td className="py-2 pr-4 text-foreground font-medium">Total</td>
                                        {totals.map((t) => (
                                            <td key={t.key} className="py-2 px-3 text-right font-medium">{renderCell({ invested: t.invested, value: t.value })}</td>
                                        ))}
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-muted">
                        Valoarea „acum” = ce valorează astăzi ce s-a cumpărat/depus în perioada respectivă. Vanguard și Fidelity apar pe fiecare cont în parte. Valorile urmează toggle-ul de monedă de sus.
                    </p>
                </div>
            )}
        </Card>
    );
}
