"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/core";
import type { ApiUsageReport, CountedUsage } from "@/lib/api-usage-report";

const COLORS = ["#0ea5e9", "#c026d3", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#e5e7eb"];
const nf = new Intl.NumberFormat("ro-RO");
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const shortDay = (iso: string) => `${Number(iso.slice(8, 10))}.${iso.slice(5, 7)}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-faint">{label}</div>
            <div className="mt-0.5 font-mono text-lg text-foreground">{value}</div>
            {hint && <div className="text-[11px] text-muted">{hint}</div>}
        </div>
    );
}

function Quota({ used, limit, unit, pace }: { used: number; limit: number; unit: string; pace?: number }) {
    const pct = limit > 0 ? (used / limit) * 100 : 0;
    const pacePct = pace !== undefined && limit > 0 ? (pace / limit) * 100 : null;
    const tone = (p: number) => (p >= 90 ? "text-red-400" : p >= 60 ? "text-amber-300" : "text-emerald-300");
    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-2xl text-foreground">
                    {compact(used)} <span className="text-base text-muted">/ {compact(limit)} {unit}</span>
                </span>
                <span className={`font-mono text-sm ${tone(pct)}`}>{pct < 0.1 && used > 0 ? "<0.1" : pct.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.max(pct, used > 0 ? 0.5 : 0))}%` }} />
            </div>
            {pacePct !== null && pace !== undefined && (
                <div className="mt-1.5 text-xs text-muted">
                    În ritmul ultimelor zile: ~{compact(pace)} {unit} pe lună, adică <span className={tone(pacePct)}>{pacePct.toFixed(pacePct < 10 ? 1 : 0)}% din plafon</span>.
                </div>
            )}
        </div>
    );
}

function DailyBars({ data, series }: { data: Record<string, string | number>[]; series: string[] }) {
    return (
        <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" minTickGap={14} />
                    <YAxis tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" width={40} tickFormatter={(v) => compact(Number(v))} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} formatter={(v) => nf.format(Number(v))} />
                    {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    {series.map((s, i) => (
                        <Bar key={s} dataKey={s} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === series.length - 1 ? [3, 3, 0, 0] : undefined} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

const countedRows = (u: CountedUsage) => u.days.map((d) => ({ label: shortDay(d.day), ...Object.fromEntries(u.series.map((s) => [s, d.parts[s] ?? 0])) }));

function CountedNote({ u }: { u: CountedUsage }) {
    return (
        <p className="text-[11px] text-muted">
            {u.countedSince ? `Numărat de platformă începând cu ${u.countedSince}; zilele dinainte apar goale.` : "Platforma încă nu a numărat nicio cerere — primele apar la următoarea rulare a boților sau la următoarea pagină deschisă."}
            {(u.limited30 > 0 || u.errors30 > 0) && ` În ultimele 30 de zile: ${u.limited30} cereri refuzate pentru limită (429), ${u.errors30} alte erori.`}
        </p>
    );
}

export function ApiUsageClient({ report }: { report: ApiUsageReport }) {
    const { oneinch, jupiter, alchemy } = report;
    const chains = Object.entries(oneinch.byChain).sort((a, b) => b[1] - a[1]);
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="font-display mb-1 text-3xl font-medium tracking-tight text-foreground">Consum API</h1>
                    <p className="text-sm text-muted">Câte cereri trimite platforma către serviciile externe, pe zile (UTC), față de plafonul planului gratuit.</p>
                </div>
                <a href="/admin" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground">
                    ← Admin
                </a>
            </div>

            <Card>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-base font-medium text-foreground">1inch</h2>
                    <span className="text-xs text-muted">
                        Ciclul planului: {oneinch.cycleStart} → {oneinch.cycleEnd}
                    </span>
                </div>
                <Quota used={oneinch.cycleTotal} limit={oneinch.limit} unit="cereri" pace={oneinch.monthlyPace} />
                <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Azi" value={nf.format(oneinch.today)} />
                    <Stat label="Ultimele 7 zile" value={nf.format(oneinch.last7)} />
                    <Stat label="Ultimele 30 de zile" value={nf.format(oneinch.last30)} />
                    <Stat label="Pe rețele (ciclu)" value={chains.length ? chains.map(([n, c]) => `${n} ${compact(c)}`).join(" · ") : "—"} />
                </div>
                <DailyBars data={countedRows(oneinch)} series={oneinch.series} />
                <div className="mt-3">
                    <CountedNote u={oneinch} />
                    {oneinch.countedSince && oneinch.countedSince > oneinch.cycleStart && (
                        <p className="text-[11px] text-muted">Totalul ciclului curent include doar cererile de după {oneinch.countedSince}; cifra completă a ciclului e în portalul 1inch.</p>
                    )}
                </div>
            </Card>

            <Card>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-base font-medium text-foreground">Alchemy</h2>
                    <span className="text-xs text-muted">Unități de calcul (CU), luna calendaristică curentă · cifra oficială Alchemy</span>
                </div>
                {!alchemy.configured ? (
                    <p className="text-sm text-muted">
                        Lipsește <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs">ALCHEMY_ACCESS_KEY</code> în Vercel. E o cheie de acces creată în contul Alchemy (nu cheia aplicației, cea care începe cu
                        <code className="mx-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-xs">alch_</code>), cu drept de citire a consumului.
                    </p>
                ) : alchemy.error ? (
                    <p className="text-sm text-red-300">Nu am putut citi consumul: {alchemy.error}</p>
                ) : (
                    <>
                        <Quota used={alchemy.monthTotal} limit={alchemy.limit} unit="CU" pace={alchemy.monthlyPace || undefined} />
                        <div className="mt-4">
                            <DailyBars data={alchemy.days.map((d) => ({ label: shortDay(d.day), CU: d.cu }))} series={["CU"]} />
                        </div>
                    </>
                )}
            </Card>

            <Card>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-base font-medium text-foreground">Jupiter</h2>
                    <span className="text-xs text-muted">Fără plafon lunar · limită de 60 de cereri pe minut</span>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Azi" value={nf.format(jupiter.today)} />
                    <Stat label="Ultimele 7 zile" value={nf.format(jupiter.last7)} />
                    <Stat label="Ultimele 30 de zile" value={nf.format(jupiter.last30)} />
                    <Stat label="Refuzate (429) · 30 zile" value={nf.format(jupiter.limited30)} hint={jupiter.limited30 > 0 ? "limita pe minut a fost atinsă" : undefined} />
                </div>
                <DailyBars data={countedRows(jupiter)} series={jupiter.series} />
                <div className="mt-3">
                    <CountedNote u={jupiter} />
                </div>
            </Card>
        </div>
    );
}
