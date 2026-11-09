"use client";

import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/components/ui/core";
import type { LendPositionFull } from "@/lib/solana/jupiter-lend";

const GREEN = "#52c98a";
const RED = "#f0616d";
const PURPLE = "#a970ff";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "rgba(255,255,255,0.3)";
const DAY = 24 * 3600 * 1000;

type Period = "month" | "year";

const usd = (v: number) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tone = (v: number) => (v >= 0 ? "text-emerald-300" : "text-red-300");

const startOf = (t: number, k: Period) => {
    const d = new Date(t);
    return k === "year" ? Date.UTC(d.getUTCFullYear(), 0, 1) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const nextOf = (t: number, k: Period) => {
    const d = new Date(t);
    return k === "year" ? Date.UTC(d.getUTCFullYear() + 1, 0, 1) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};
const MONTHS = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const labelOf = (t: number, k: Period) => {
    const d = new Date(t);
    return k === "year" ? String(d.getUTCFullYear()) : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

interface Row {
    label: string;
    profit: number;
    intA: number; // interest accrued so far in the period
    intE: number; // interest still expected in the period (current period only)
    interest: number;
    net: number;
    partial: boolean;
}

/** Realized bot profit per calendar month/year against the loan interest of the same period. */
export function ProfitVsInterestChart({ p, profits }: { p: LendPositionFull; profits: { t: number; usd: number }[] }) {
    const [period, setPeriod] = useState<Period>("month");
    const [kind, setKind] = useState<"bars" | "line">("bars");
    const [now] = useState(() => Date.now());

    const rows = useMemo<Row[]>(() => {
        const curve = p.curve;
        const dayPaid = p.interest?.projection.day.paidUsd ?? 0;
        // Cumulative interest (USD) at time t: interpolate the curve, extrapolate after its end at today's daily rate.
        const cum = (t: number) => {
            if (curve.length === 0) return 0;
            const a = curve[0];
            const z = curve[curve.length - 1];
            if (t <= a.t) return 0;
            if (t >= z.t) return z.paidUsd + (dayPaid * (t - z.t)) / DAY;
            let k = 1;
            while (curve[k].t < t) k++;
            const l = curve[k - 1];
            const r = curve[k];
            return l.paidUsd + (r.paidUsd - l.paidUsd) * ((t - l.t) / (r.t - l.t || 1));
        };
        const firstSale = profits.length ? Math.min(...profits.map((x) => x.t)) : now;
        const opened = curve.length ? curve[0].t : now;
        const first = Math.min(firstSale, opened);
        const cur = startOf(now, period);
        const maxN = period === "year" ? 6 : 12;
        let start = startOf(first, period);
        // keep the last `maxN` periods ending with the current one
        let n = 0;
        for (let b = start; b <= cur; b = nextOf(b, period)) n++;
        for (; n > maxN; n--) start = nextOf(start, period);

        const out: Row[] = [];
        for (let b = start; b <= cur; b = nextOf(b, period)) {
            const e = nextOf(b, period);
            const profit = profits.filter((x) => x.t >= b && x.t < e).reduce((s, x) => s + x.usd, 0);
            const from = Math.max(b, opened);
            const full = Math.max(0, cum(e) - cum(from));
            const actual = Math.max(0, cum(Math.min(e, now)) - cum(from));
            const partial = e > now;
            const intA = actual;
            const intE = partial ? Math.max(0, full - actual) : 0;
            out.push({ label: labelOf(b, period), profit, intA, intE, interest: intA + intE, net: profit - (intA + intE), partial });
        }
        return out;
    }, [p.curve, p.interest, profits, period, now]);

    const totals = rows.reduce((s, r) => ({ profit: s.profit + r.profit, interest: s.interest + r.intA }), { profit: 0, interest: 0 });
    const hasProfit = rows.some((r) => r.profit !== 0);

    return (
        <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-display text-sm font-medium text-foreground">Istoric: profit bot vs. dobândă, pe {period === "month" ? "luni" : "ani"} calendaristice</h3>
                    <p className="text-xs text-muted">
                        Profit = loturi vândute în perioadă. Dobânda: plin = acumulat până acum, transparent = estimat pentru restul perioadei curente. Perioadele sunt în UTC.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 text-xs">
                    {(["bars", "line"] as const).map((k) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setKind(k)}
                            className={cn("rounded-md px-3 py-1 transition-colors", kind === k ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground")}
                        >
                            {k === "bars" ? "Bare" : "Linie"}
                        </button>
                    ))}
                </div>
                <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 text-xs">
                    {(["month", "year"] as const).map((k) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setPeriod(k)}
                            className={cn("rounded-md px-3 py-1 transition-colors", period === k ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground")}
                        >
                            {k === "month" ? "Luni" : "Ani"}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={240}>
                {kind === "bars" ? (
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>

                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" type="category" tick={{ fontSize: 11 }} stroke={AXIS} />
                    <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={(v) => `$${Number(v).toFixed(Math.abs(Number(v)) < 10 ? 2 : 0)}`} width={52} />
                    <ReferenceLine y={0} stroke={AXIS} />
                    <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        content={({ active, payload }) => {
                            const r = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                            if (!r) return null;
                            return (
                                <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs">
                                    <p className="mb-1 text-foreground">{r.label}{r.partial ? " (în curs)" : ""}</p>
                                    <p style={{ color: GREEN }}>Profit bot: {usd(r.profit)}</p>
                                    <p style={{ color: RED }}>
                                        Dobândă: {usd(r.interest)}
                                        {r.partial ? ` (acumulat ${usd(r.intA)})` : ""}
                                    </p>
                                    <p className={cn("mt-1 font-medium", tone(r.net))}>Net: {usd(r.net)}</p>
                                </div>
                            );
                        }}
                    />
                    <Bar dataKey="profit" name="Profit bot" fill={GREEN} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="intA" name="Dobândă acumulată" stackId="i" fill={RED} />
                    <Bar dataKey="intE" name="Dobândă estimată" stackId="i" fill={RED} fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                                </BarChart>
                ) : (
                <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>

                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" type="category" tick={{ fontSize: 11 }} stroke={AXIS} />
                    <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={(v) => `$${Number(v).toFixed(Math.abs(Number(v)) < 10 ? 2 : 0)}`} width={52} />
                    <ReferenceLine y={0} stroke={AXIS} />
                    <Tooltip
                        cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                        content={({ active, payload }) => {
                            const r = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                            if (!r) return null;
                            return (
                                <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs">
                                    <p className="mb-1 text-foreground">{r.label}{r.partial ? " (în curs)" : ""}</p>
                                    <p style={{ color: GREEN }}>Profit bot: {usd(r.profit)}</p>
                                    <p style={{ color: RED }}>
                                        Dobândă: {usd(r.interest)}
                                        {r.partial ? ` (acumulat ${usd(r.intA)})` : ""}
                                    </p>
                                    <p className={cn("mt-1 font-medium", tone(r.net))}>Net: {usd(r.net)}</p>
                                </div>
                            );
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="profit" name="Profit bot" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="interest" name="Dobândă" stroke={RED} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="net" name="Net" stroke={PURPLE} strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
                )}
            </ResponsiveContainer>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-xs">
                    <thead>
                        <tr className="text-left text-faint">
                            <th className="py-1.5 pr-3 font-medium">Perioadă</th>
                            <th className="py-1.5 pr-3 text-right font-medium">Profit bot</th>
                            <th className="py-1.5 pr-3 text-right font-medium">Dobândă</th>
                            <th className="py-1.5 text-right font-medium">Net</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...rows].reverse().map((r) => (
                            <tr key={r.label} className="border-t border-white/[0.06]">
                                <td className="py-1.5 pr-3 text-foreground">
                                    {r.label}
                                    {r.partial && <span className="ml-1 text-faint">(în curs)</span>}
                                </td>
                                <td className="py-1.5 pr-3 text-right font-mono text-emerald-300">{usd(r.profit)}</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-red-300">
                                    {usd(r.interest)}
                                </td>
                                <td className={cn("py-1.5 text-right font-mono", tone(r.net))}>{usd(r.net)}</td>
                            </tr>
                        ))}
                        <tr className="border-t border-white/10 font-medium">
                            <td className="py-1.5 pr-3 text-foreground">Total acumulat</td>
                            <td className="py-1.5 pr-3 text-right font-mono text-emerald-300">{usd(totals.profit)}</td>
                            <td className="py-1.5 pr-3 text-right font-mono text-red-300">{usd(totals.interest)}</td>
                            <td className={cn("py-1.5 text-right font-mono", tone(totals.profit - totals.interest))}>{usd(totals.profit - totals.interest)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            {!hasProfit && <p className="text-xs text-muted">Niciun lot vândut încă în perioada afișată. Barele de profit apar pe măsură ce botul vinde loturi.</p>}
        </div>
    );
}
