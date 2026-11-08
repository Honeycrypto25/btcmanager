"use client";

import React, { useMemo, useState } from "react";
import {
    AreaChart,
    Area,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Legend,
} from "recharts";
import { Card, cn } from "@/components/ui/core";
import type { LendPositionFull } from "@/lib/solana/jupiter-lend";

const GREEN = "#52c98a";
const AMBER = "#e8bc70";
const RED = "#f0616d";
const PURPLE = "#a970ff";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "rgba(255,255,255,0.3)";

/** USD with enough decimals that cents-and-below interest doesn't show as $0.00. */
export const usdSmall = (v: number) => {
    const a = Math.abs(v);
    const d = a >= 100 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
    return (v < 0 ? "−" : "") + "$" + a.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const tokenSmall = (v: number, sym: string) => {
    const d = v >= 1 ? 4 : 6;
    return `${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })} ${sym}`;
};
/** Axis labels with as many decimals as the range needs ($0.0025 vs $47). */
const axisUsd = (max: number) => (v: number) => `$${Number(v).toFixed(max < 0.1 ? 4 : max < 10 ? 2 : 0)}`;
const pct = (v: number | null, d = 2) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

// Fixed zone so server render and browser agree (no hydration mismatch).
const fmtAxisTime = (t: number, spanMs: number) => {
    const day = 24 * 3600 * 1000;
    const tz = "Europe/London";
    if (spanMs < 2 * day) return new Date(t).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const d = new Date(t).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", timeZone: tz });
    // Short spans have several ticks per day, so add the hour or the labels repeat.
    return spanMs < 14 * day ? `${d} ${new Date(t).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: tz })}` : d;
};
const fmtFullTime = (t: number) =>
    new Date(t).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

const DAY = 24 * 3600 * 1000;
type ApyRow = { t: number; col: number; debt: number; spread: number };
/** One averaged point per UTC day or month (bucket start as the timestamp). */
function bucketAvg(rows: ApyRow[], unit: "day" | "month"): ApyRow[] {
    const groups = new Map<number, ApyRow[]>();
    for (const r of rows) {
        const d = new Date(r.t);
        const k = unit === "day" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
        const g = groups.get(k);
        if (g) g.push(r);
        else groups.set(k, [r]);
    }
    const avg = (g: ApyRow[], f: (r: ApyRow) => number) => g.reduce((s, r) => s + f(r), 0) / g.length;
    return [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t, g]) => ({ t, col: avg(g, (r) => r.col), debt: avg(g, (r) => r.debt), spread: avg(g, (r) => r.spread) }));
}
const fmtDayUtc = (t: number, year = false) => new Date(t).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const fmtMonth = (t: number) => new Date(t).toLocaleDateString("ro-RO", { month: "2-digit", year: "numeric", timeZone: "UTC" });

type TipEntry = { name?: string; value?: number | string; color?: string; dataKey?: string | number };
// A custom tooltip `content` ignores Recharts' labelFormatter, so the label is formatted here.
function Tip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: TipEntry[]; label?: string | number; fmt: (v: number, key?: string | number) => string; labelFmt?: (l: string | number) => string }) {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-xs shadow-xl">
            {label != null && <p className="mb-1 font-medium text-foreground">{labelFmt ? labelFmt(label) : label}</p>}
            {payload.map((e) => (
                <p key={String(e.dataKey)} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-sm" style={{ background: e.color }} />
                        {e.name}
                    </span>
                    <span className="font-mono text-foreground">{fmt(Number(e.value), e.dataKey)}</span>
                </p>
            ))}
        </div>
    );
}

/** The two interest figures asked for + the net, with a per-day/month/year projection. */
export function InterestTiles({ p }: { p: LendPositionFull }) {
    const i = p.interest;
    if (!i) return null;
    const proj = i.projection;
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Tile
                label={`Dobândă câștigată · ${p.collateral.symbol} depus`}
                value={`+${tokenSmall(i.earned, p.collateral.symbol)}`}
                valueClass="text-emerald-300"
                note={`≈ ${usdSmall(i.earnedUsd)} până acum`}
                lines={[
                    `APY ${pct(p.collateral.apy)} · APR ${pct(p.collateral.apr)}`,
                    `≈ ${usdSmall(proj.day.earnedUsd)}/zi · ${usdSmall(proj.month.earnedUsd)}/lună · ${usdSmall(proj.year.earnedUsd)}/an`,
                ]}
            />
            <Tile
                label={`Dobândă plătită · împrumut ${p.debt.symbol}`}
                value={`−${tokenSmall(i.paid, p.debt.symbol)}`}
                valueClass="text-amber-300"
                note={`≈ ${usdSmall(i.paidUsd)} până acum`}
                lines={[
                    `APY ${pct(p.debt.apy)} · APR ${pct(p.debt.apr)}`,
                    `≈ ${usdSmall(proj.day.paidUsd)}/zi · ${usdSmall(proj.month.paidUsd)}/lună · ${usdSmall(proj.year.paidUsd)}/an`,
                ]}
            />
            <Tile
                label="Dobândă netă"
                value={`${i.netUsd >= 0 ? "+" : "−"}${usdSmall(Math.abs(i.netUsd)).replace("−", "")}`}
                valueClass={i.netUsd >= 0 ? "text-emerald-300" : "text-red-300"}
                note="câștigată − plătită, până acum"
                lines={[
                    `Net APY ${p.netApy == null ? "—" : `${p.netApy >= 0 ? "+" : ""}${pct(p.netApy)}`}`,
                    `≈ ${usdSmall(proj.day.netUsd)}/zi · ${usdSmall(proj.month.netUsd)}/lună · ${usdSmall(proj.year.netUsd)}/an`,
                ]}
            />
        </div>
    );
}

/**
 * Position PnL in USD, like jup.ag: net value now minus the net value deposited
 * (each deposit/borrow at the USD price of its own day). Split into the interest
 * accrued and what's left, i.e. the price move.
 */
export function PnlCard({ p }: { p: LendPositionFull }) {
    const ok = (p.actions ?? []).filter((a) => a.status === "success");
    const official = p.extras.pnl;
    if (ok.length === 0 && !official) return null;
    // Jupiter's own number when its API answers; otherwise our own calculation from the history.
    const basis = ok.reduce((s, a) => s + a.collateralInUsd - a.collateralOutUsd - (a.debtInUsd - a.debtOutUsd), 0);
    const pnl = official ? official.usd : p.netUsd - basis;
    const pnlPct = official ? official.pct : basis > 0 ? pnl / basis : null;
    const interest = p.interest?.netUsd ?? 0;
    const price = pnl - interest;
    const signed = (v: number) => `${v >= 0 ? "+" : "−"}${usdSmall(Math.abs(v)).replace("−", "")}`;
    const tone = (v: number) => (v >= 0 ? "text-emerald-300" : "text-red-300");
    return (
        <div className="space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Profit poziție (USD)</p>
            <p className={cn("font-mono text-xl font-medium", tone(pnl))}>
                {signed(pnl)} {pnlPct != null && <span className="text-sm text-muted">({pnlPct >= 0 ? "+" : "−"}{(Math.abs(pnlPct) * 100).toFixed(2)}%)</span>}
            </p>
            <p className="text-xs text-muted">
                {official
                    ? "cifra oficială din Jupiter (valoarea netă acum − valoarea netă depusă)"
                    : `valoarea netă acum (${usdSmall(p.netUsd)}) − valoarea netă depusă (${usdSmall(basis)}), calculat din istoric`}
            </p>
            <p className="text-[11px] text-faint">
                din care dobândă <span className={tone(interest)}>{signed(interest)}</span> · mișcarea prețului <span className={tone(price)}>{signed(price)}</span>
            </p>
        </div>
    );
}

/** How much more could be borrowed before the LTV reaches the user's own cap. */
export function BorrowRoom({ p, capLtv }: { p: LendPositionFull; capLtv: number }) {
    const maxDebt = p.collateral.usd * capLtv;
    const room = maxDebt - p.debt.usd;
    const ok = room >= 0;
    return (
        <div className="space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Poți mai împrumuta acum</p>
            <p className={cn("font-mono text-xl font-medium", ok ? "text-emerald-300" : "text-red-300")}>
                {ok ? usdSmall(room) : `−${usdSmall(-room).replace("−", "")}`}
            </p>
            <p className="text-xs text-muted">
                până la LTV {(capLtv * 100).toFixed(0)}% (datorie maximă {usdSmall(maxDebt)}, acum {usdSmall(p.debt.usd)})
            </p>
            <p className="text-[11px] text-faint">
                {ok ? "Fiecare $100 de colateral adăugat îți dă" : "Peste plafon. Fiecare $100 de colateral adăugat îți dă"} ≈ {usdSmall(100 * capLtv)} capacitate în plus.
            </p>
        </div>
    );
}

/** Is the position on the plus? Rate × amount, not the raw rate difference. */
export function ProfitabilityCard({ p }: { p: LendPositionFull }) {
    const pr = p.profit;
    const cApy = p.collateral.apy;
    const dApy = p.debt.apy;
    const pp = pr.spread == null ? null : pr.spread * 100;
    const net = pr.netYearUsd;
    return (
        <div className={cn("space-y-2 rounded-xl border p-4", pr.positive ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-red-400/25 bg-red-400/[0.04]")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Profitabilitate · APY colateral vs APY împrumut</p>
                <span className={cn("rounded-full px-3 py-0.5 text-xs font-medium", pr.positive ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300")}>
                    {pr.positive ? "Pe plus" : "Pe minus"}
                </span>
            </div>
            {pp != null && (
                <p className="font-mono text-sm text-foreground">
                    {pct(cApy)} − {pct(dApy)} = {pp >= 0 ? "+" : "−"}
                    {Math.abs(pp).toFixed(2)} pp <span className="font-sans text-xs text-faint">(diferența simplă dintre cele două APY)</span>
                </p>
            )}
            {net != null && (
                <p className="text-xs text-muted">
                    {pp != null && pp < 0 && pr.positive && pr.collateralToDebt != null
                        ? `Diferența simplă e negativă, dar colateralul valorează de ${pr.collateralToDebt.toFixed(1)}× datoria, deci rezultatul real e pozitiv: `
                        : "Rezultat real la soldurile de acum: "}
                    <span className={cn("font-mono", pr.positive ? "text-emerald-300" : "text-red-300")}>
                        {net >= 0 ? "+" : "−"}
                        {usdSmall(Math.abs(net)).replace("−", "")}/an
                    </span>
                    {p.netApy != null && ` (Net APY ${p.netApy >= 0 ? "+" : ""}${pct(p.netApy)} pe capitalul tău de ${usdSmall(p.netUsd)})`}.
                </p>
            )}
            {pr.breakEvenBorrowApy != null && pr.breakEvenCollateralApy != null && (
                <p className="text-xs text-faint">
                    Rămâi pe plus cât timp APY-ul împrumutului e sub {pct(pr.breakEvenBorrowApy)} (acum {pct(dApy)}) sau APY-ul colateralului e peste {pct(pr.breakEvenCollateralApy)} (acum {pct(cApy)}).
                </p>
            )}
        </div>
    );
}

function Tile({ label, value, valueClass, note, lines }: { label: string; value: string; valueClass: string; note: string; lines: string[] }) {
    return (
        <div className="space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>
            <p className={cn("font-mono text-xl font-medium", valueClass)}>{value}</p>
            <p className="text-xs text-muted">{note}</p>
            {lines.map((l) => (
                <p key={l} className="text-[11px] text-faint">
                    {l}
                </p>
            ))}
        </div>
    );
}

export function LendCharts({ p, fetchedAt }: { p: LendPositionFull; fetchedAt: string }) {
    return (
        <div className="grid grid-cols-1 gap-4">
            {p.interest && <ProjectionChart p={p} />}
            {p.interest && p.curve.length > 1 && <AccruedChart p={p} />}
            <ApySpreadChart p={p} fetchedAt={fetchedAt} />
            <VaultRatesChart p={p} />
            <LtvChart p={p} />
        </div>
    );
}

function ChartCard({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-display text-sm font-medium text-foreground">{title}</h3>
                    <p className="text-xs text-muted">{subtitle}</p>
                </div>
                {action}
            </div>
            {children}
        </Card>
    );
}

/** Cumulative interest over the next 12 months at today's balances, rates and prices. */
function ProjectionChart({ p }: { p: LendPositionFull }) {
    const year = p.interest!.projection.year;
    const rows = useMemo(
        () =>
            Array.from({ length: 13 }, (_, m) => ({
                label: m === 0 ? "Acum" : `+${m}`,
                earned: (year.earnedUsd * m) / 12,
                paid: (year.paidUsd * m) / 12,
                net: (year.netUsd * m) / 12,
            })),
        [year]
    );
    return (
        <ChartCard title="Proiecție dobândă · 12 luni" subtitle="Cumulat, la soldurile, ratele și prețurile de acum — o estimare, nu o valoare garantată. Axa = luni de acum încolo.">
            <ResponsiveContainer width="100%" height={340}>
                <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={AXIS} interval={1} />
                    <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={axisUsd(Math.max(year.earnedUsd, year.paidUsd))} width={52} />
                    <Tooltip content={<Tip fmt={usdSmall} labelFmt={(l) => (l === "Acum" ? "Acum" : `Peste ${String(l).replace("+", "")} luni`)} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="earned" name={`Câștigată (${p.collateral.symbol})`} stroke={GREEN} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="paid" name={`Plătită (${p.debt.symbol})`} stroke={AMBER} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="net" name="Netă" stroke={PURPLE} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}

/** Interest accumulated since the first transaction. */
function AccruedChart({ p }: { p: LendPositionFull }) {
    const span = p.curve[p.curve.length - 1].t - p.curve[0].t;
    const rows = useMemo(() => p.curve.map((c) => ({ t: c.t, earned: c.earnedUsd, paid: c.paidUsd })), [p.curve]);
    // A handful of evenly spaced ticks — one per data point repeats the same day label.
    const ticks = useMemo(() => {
        const first = p.curve[0].t;
        const last = p.curve[p.curve.length - 1].t;
        return Array.from({ length: 6 }, (_, i) => first + ((last - first) * i) / 5);
    }, [p.curve]);
    const maxVal = Math.max(...p.curve.map((c) => Math.max(c.earnedUsd, c.paidUsd)));
    return (
        <ChartCard
            title="Dobândă acumulată de la deschidere"
            subtitle="Punctele intermediare sunt estimate din tranzacții și rata de acum; ultimul punct e valoarea reală din poziție."
        >
            <ResponsiveContainer width="100%" height={340}>
                <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        ticks={ticks}
                        tick={{ fontSize: 11 }}
                        stroke={AXIS}
                        tickFormatter={(t) => fmtAxisTime(Number(t), span)}
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={axisUsd(maxVal)} width={64} />
                    <Tooltip content={<Tip fmt={usdSmall} labelFmt={(l) => fmtFullTime(Number(l))} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="earned" name={`Câștigată (${p.collateral.symbol})`} stroke={GREEN} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="paid" name={`Plătită (${p.debt.symbol})`} stroke={AMBER} strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}

/** The vault's own hourly rates for the last 7 days (market context, not this position). The API publishes them with a delay. */
function VaultRatesChart({ p }: { p: LendPositionFull }) {
    const rows = useMemo(
        () => p.extras.rates.map((r) => ({ t: r.t, supply: ((1 + r.supplyApr / 365) ** 365 - 1) * 100, borrow: ((1 + r.borrowApr / 365) ** 365 - 1) * 100 })),
        [p.extras.rates]
    );
    if (rows.length < 2) return null;
    const first = rows[0].t;
    const last = rows[rows.length - 1].t;
    const span = last - first;
    const ticks = Array.from({ length: 6 }, (_, i) => first + (span * i) / 5);
    const lo = Math.min(...rows.map((r) => r.borrow));
    const hi = Math.max(...rows.map((r) => r.borrow));
    return (
        <ChartCard
            title="Rata vault-ului · ultimele 7 zile"
            subtitle={`Rata de împrumut a fost între ${lo.toFixed(2)}% și ${hi.toFixed(2)}% APY. Date de piață pentru tot vault-ul (nu doar poziția ta), publicate cu întârziere — ultimul punct: ${fmtFullTime(last)}.`}
        >
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={(t) => fmtAxisTime(Number(t), span)} />
                    <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={48} />
                    <Tooltip content={<Tip fmt={(v) => `${v.toFixed(2)}%`} labelFmt={(l) => fmtFullTime(Number(l))} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="supply" name="APY depunere (vault)" stroke={GREEN} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="borrow" name="APY împrumut (vault)" stroke={AMBER} strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}

/**
 * Collateral APY vs loan APY and their difference — from the values recorded for
 * THIS position (not the vault's market history), plus today's live point.
 */
function ApySpreadChart({ p, fetchedAt }: { p: LendPositionFull; fetchedAt: string }) {
    const liveT = new Date(fetchedAt).getTime();
    const rows = useMemo(() => {
        const pts = p.snapshots.map((s) => ({ t: s.t, col: s.supplyApy * 100, debt: s.borrowApy * 100, spread: (s.supplyApy - s.borrowApy) * 100 }));
        const last = pts.length ? pts[pts.length - 1].t : 0;
        if (p.collateral.apy != null && p.debt.apy != null && liveT - last > 5 * 60 * 1000) {
            pts.push({ t: liveT, col: p.collateral.apy * 100, debt: p.debt.apy * 100, spread: (p.collateral.apy - p.debt.apy) * 100 });
        }
        return pts;
    }, [p.snapshots, p.collateral.apy, p.debt.apy, liveT]);

    // Default: last 90 days; once more than 90 days of data exist, switch to the monthly view.
    const [pick, setPick] = useState<"w" | "m" | "y" | null>(null);
    const end = rows.length ? rows[rows.length - 1].t : liveT;
    const auto: "m" | "y" = rows.length && end - rows[0].t > 90 * DAY ? "y" : "m";
    const mode = pick ?? auto;
    const { view, raw } = useMemo(() => {
        if (mode === "w") return { view: rows.filter((r) => r.t >= end - 7 * DAY), raw: true };
        let inWin: ApyRow[];
        let b: ApyRow[];
        if (mode === "m") {
            inWin = rows.filter((r) => r.t >= end - 90 * DAY);
            b = bucketAvg(inWin, "day");
        } else {
            const from = new Date(end);
            from.setUTCMonth(from.getUTCMonth() - 11, 1);
            from.setUTCHours(0, 0, 0, 0);
            inWin = rows.filter((r) => r.t >= from.getTime());
            b = bucketAvg(inWin, "month");
        }
        // Too little history to average (e.g. everything recorded within one day): show the raw points.
        return b.length >= 2 ? { view: b, raw: false } : { view: inWin, raw: true };
    }, [rows, mode, end]);

    const title = "Diferența APY · colateral − împrumut";
    if (rows.length < 2) {
        const r = rows[0];
        return (
            <ChartCard title={title} subtitle="Din valorile înregistrate pentru poziția ta — graficul apare după a doua înregistrare.">
                <p className="text-sm text-muted">
                    Se înregistrează la fiecare deschidere a paginii (cel mult o dată la 20 de minute) și o dată pe zi automat.
                    {r && (
                        <>
                            {" "}
                            Acum: colateral {r.col.toFixed(2)}% · împrumut {r.debt.toFixed(2)}% · diferență {r.spread >= 0 ? "+" : "−"}
                            {Math.abs(r.spread).toFixed(2)} pp.
                        </>
                    )}
                </p>
            </ChartCard>
        );
    }

    const toggle = (
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 text-xs">
            {(["w", "m", "y"] as const).map((k) => (
                <button
                    key={k}
                    type="button"
                    onClick={() => setPick(k)}
                    className={cn("rounded-md px-3 py-1 transition-colors", mode === k ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground")}
                >
                    {k === "w" ? "Săptămână" : k === "m" ? "Lună" : "An"}
                </button>
            ))}
        </div>
    );
    const modeNote = mode === "w" ? "ultimele 7 zile, toate înregistrările" : mode === "m" ? "ultimele 90 de zile, media zilnică" : "ultimele 12 luni, media lunară";

    if (view.length < 2) {
        return (
            <ChartCard title={title} subtitle={`Vedere: ${modeNote}.`} action={toggle}>
                <p className="text-sm text-muted">Nu sunt încă destule înregistrări în această fereastră. Alege altă perioadă sau revino după următoarele înregistrări.</p>
            </ChartCard>
        );
    }

    const first = view[0].t;
    const last = view[view.length - 1].t;
    const span = last - first;
    // Monthly view: one tick per month (evenly spaced ticks would repeat the same month label).
    const ticks = !raw && mode === "y" ? view.map((r) => r.t) : Array.from({ length: 6 }, (_, i) => first + (span * i) / 5);
    const bucketed = !raw;
    const axisFmt = (t: number) => (raw ? fmtAxisTime(t, span) : mode === "y" ? fmtMonth(t) : fmtDayUtc(t));
    const tipLabel = (l: string | number) => (raw ? fmtFullTime(Number(l)) : mode === "y" ? fmtMonth(Number(l)) : fmtDayUtc(Number(l), true));
    return (
        <ChartCard
            title={title}
            action={toggle}
            subtitle={`Vedere: ${modeNote} · ${view.length} puncte, din valorile înregistrate pentru poziția ta. Peste linia 0 = dobânda colateralului e mai mare decât a împrumutului.`}
        >
            <ResponsiveContainer width="100%" height={340}>
                <LineChart data={view} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={(t) => axisFmt(Number(t))} />
                    <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={48} />
                    <Tooltip content={<Tip fmt={(v, k) => (k === "spread" ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} pp` : `${v.toFixed(2)}%`)} labelFmt={tipLabel} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="#ffffff" strokeOpacity={0.4} />
                    <Line type="monotone" dataKey="col" name="APY colateral" stroke={GREEN} strokeWidth={2} dot={view.length < 12 || bucketed && view.length < 40} />
                    <Line type="monotone" dataKey="debt" name="APY împrumut" stroke={AMBER} strokeWidth={2} dot={view.length < 12 || bucketed && view.length < 40} />
                    <Line type="monotone" dataKey="spread" name="Diferență (pp)" stroke={PURPLE} strokeWidth={2} strokeDasharray="5 4" dot={view.length < 12 || bucketed && view.length < 40} />
                </LineChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}

/** LTV as the collateral price moves — shows how far the liquidation is. */
function LtvChart({ p }: { p: LendPositionFull }) {
    const amount = p.collateral.amount;
    const debtUsd = p.debt.usd;
    const cur = p.collateral.priceUsd;
    const lt = p.liqThreshold;
    const rows = useMemo(() => {
        if (!(amount > 0) || !(cur > 0)) return [];
        const lo = cur * 0.2;
        const hi = cur * 1.6;
        const n = 64;
        return Array.from({ length: n + 1 }, (_, i) => {
            const price = lo + ((hi - lo) * i) / n;
            return { price, ltv: (debtUsd / (amount * price)) * 100 };
        });
    }, [amount, debtUsd, cur]);
    if (rows.length === 0) return null;
    const liqPriceUsd = lt ? debtUsd / (amount * lt) : null;

    return (
        <ChartCard
            title={`LTV în funcție de prețul ${p.collateral.symbol}`}
            subtitle={
                liqPriceUsd != null
                    ? `Lichidare când ${p.collateral.symbol} ajunge la ≈ ${usdSmall(liqPriceUsd)} (acum ${usdSmall(cur)}).`
                    : "Cum se schimbă LTV-ul dacă prețul colateralului se mișcă."
            }
        >
            <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`ltvFill-${p.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={PURPLE} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis
                        dataKey="price"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 11 }}
                        stroke={AXIS}
                        tickFormatter={(v) => `$${Math.round(Number(v))}`}
                    />
                    <YAxis domain={[0, 100]} allowDataOverflow tick={{ fontSize: 11 }} stroke={AXIS} tickFormatter={(v) => `${v}%`} width={44} />
                    <Tooltip content={<Tip fmt={(v) => `${v.toFixed(1)}%`} labelFmt={(v) => `${p.collateral.symbol} = ${usdSmall(Number(v))}`} />} />
                    <Area type="monotone" dataKey="ltv" name="LTV" stroke={PURPLE} strokeWidth={2} fill={`url(#ltvFill-${p.id})`} />
                    {p.maxLtv != null && (
                        <ReferenceLine y={p.maxLtv * 100} stroke={AMBER} strokeDasharray="6 4" label={{ value: `LTV max ${(p.maxLtv * 100).toFixed(0)}%`, position: "insideTopRight", fill: AMBER, fontSize: 11 }} />
                    )}
                    {lt != null && (
                        <ReferenceLine y={lt * 100} stroke={RED} strokeDasharray="6 4" label={{ value: `Lichidare ${(lt * 100).toFixed(0)}%`, position: "insideBottomRight", fill: RED, fontSize: 11 }} />
                    )}
                    <ReferenceLine x={cur} stroke="#ffffff" strokeOpacity={0.6} label={{ value: "Acum", position: "insideTopLeft", fill: "#ffffff", fontSize: 11 }} />
                    {liqPriceUsd != null && liqPriceUsd >= rows[0].price && <ReferenceLine x={liqPriceUsd} stroke={RED} />}
                </AreaChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}
