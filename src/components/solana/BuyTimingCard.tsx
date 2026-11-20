"use client";

import React, { useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { Card, cn } from "@/components/ui/core";
import { SortTh, useSort } from "@/components/ui/SortableTh";
import { computeTimingRows, groupTiming, summarize, type TimingLot, type TimingPeriod, type TimingRow } from "@/lib/buy-timing";
import type { PriceHistory } from "@/lib/price-history";

interface Props {
    lots: TimingLot[];
    history: PriceHistory | null;
    error: string | null;
    fmt: (n: number) => string;
}

const SOURCE_TAG: Record<string, string> = {
    Coinbase: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
    Binance: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
};
function SourceTag({ name }: { name: string }) {
    return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium ring-1", SOURCE_TAG[name] ?? "bg-white/[0.06] text-muted ring-white/10")}>{name}</span>;
}
const accTone = (p: number | null) => (p === null ? "text-muted" : p >= 99.5 ? "text-emerald-300" : p >= 95 ? "text-amber-300" : "text-red-300");
const fmtAcc = (p: number | null) => (p === null ? "—" : `${p >= 99.95 ? 100 : p.toFixed(1)}%`);

const FIELDS = [
    ["low", "minim"],
    ["high", "maxim"],
    ["open", "deschidere"],
    ["close", "închidere"],
] as const;

const PERIODS: { id: TimingPeriod; label: string }[] = [
    { id: "week", label: "Săptămânal" },
    { id: "month", label: "Lunar" },
    { id: "year", label: "Anual" },
];

// Low in the day's range = cheap buy = good.
const tone = (p: number | null) => (p === null ? "text-muted" : p <= 100 / 3 ? "text-emerald-300" : p <= 200 / 3 ? "text-amber-300" : "text-red-300");
const fill = (p: number | null) => (p === null ? "rgba(255,255,255,0.15)" : p <= 100 / 3 ? "#10b981" : p <= 200 / 3 ? "#f59e0b" : "#ef4444");
const fmtPos = (p: number | null) => (p === null ? "—" : `${Math.round(p)}%`);
const fmtAbove = (p: number | null) => (p === null ? "—" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}%`);

function PositionBar({ p }: { p: number | null }) {
    return (
        <div className="flex items-center gap-2">
            <div className="relative h-1.5 w-16 rounded-full bg-gradient-to-r from-emerald-500/30 via-amber-400/30 to-red-500/30">
                {p !== null && <span className="absolute top-1/2 h-2.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-foreground" style={{ left: `${p}%` }} />}
            </div>
            <span className={cn("font-mono", tone(p))}>{fmtPos(p)}</span>
        </div>
    );
}

/** Solana: where each buy landed between the low and the high of its (UTC) day, grouped by week / month / year. */
export function BuyTimingCard({ lots, history, error: loadError, fmt }: Props) {
    const [period, setPeriod] = useState<TimingPeriod>("week");
    const [picked, setPicked] = useState<string | null>(null);
    const usable = (history?.sources ?? []).filter((s) => s.candles.length > 0);
    const [sourceName, setSourceName] = useState<string | null>(null);
    const src = usable.find((s) => s.name === sourceName) ?? usable[0] ?? null;
    const candles = src?.candles ?? null;
    const source = src ? `${src.name} (${src.pair})` : null;
    const error = loadError ?? (src?.error ? `${src.name}: ${src.error}` : null);

    const rows = useMemo(() => (candles ? computeTimingRows(lots, candles) : []), [lots, candles]);
    const buckets = useMemo(() => groupTiming(rows, period), [rows, period]);
    const overall = useMemo(() => summarize(rows), [rows]);
    const selected = buckets.find((b) => b.key === picked) ?? buckets[buckets.length - 1];

    const { sorted, sort, toggle } = useSort<TimingRow>(
        selected?.rows ?? [],
        { date: (r) => r.t, price: (r) => r.buyPriceUsd, low: (r) => r.low, high: (r) => r.high, position: (r) => r.position, above: (r) => r.aboveLow, amount: (r) => r.buyAmountUsd },
        { key: "date", dir: "desc" },
    );

    const chartData = buckets.map((b) => ({ key: b.key, label: b.label, pos: b.avgPosition === null ? null : Math.round(b.avgPosition * 10) / 10, above: b.avgAboveLow === null ? null : Math.round(b.avgAboveLow * 100) / 100, n: b.n }));

    return (
        <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                    <h2 className="text-sm font-medium text-foreground">Momentul cumpărării față de minimul și maximul zilei</h2>
                    <p className="text-xs text-muted">
                        Cât de aproape de minimul zilei a cumpărat botul. Apasă pe o bară ca să vezi ordinele din perioada respectivă; ce înseamnă fiecare termen e în legenda de jos.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                {usable.length > 1 && (
                    <div className="flex rounded-lg border border-white/10 p-0.5" title="Sursa minimului și maximului zilnic">
                        {usable.map((s) => (
                            <button
                                key={s.name}
                                type="button"
                                onClick={() => setSourceName(s.name)}
                                className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", src?.name === s.name ? "bg-white/[0.1] text-foreground" : "text-muted hover:text-foreground")}
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex rounded-lg border border-white/10 p-0.5">
                    {PERIODS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                                setPeriod(p.id);
                                setPicked(null);
                            }}
                            className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", period === p.id ? "bg-white/[0.1] text-foreground" : "text-muted hover:text-foreground")}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            {!candles ? (
                <p className="text-sm text-muted">Nu am putut încărca minimul și maximul zilnic al SOL{error ? `: ${error}` : ""}. Reîncearcă peste câteva minute.</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-muted">Încă nu există cumpărări.</p>
            ) : (
                <>
                    {error && <p className="mb-3 text-xs text-amber-300">Nu am putut actualiza minimul și maximul ({error}); arăt zilele deja salvate.</p>}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" title="Media pozițiilor tuturor cumpărărilor. 0% = toate la minimul zilei, 100% = toate la maxim; 50% = la mijloc, cât ai obține cumpărând la o oră oarecare.">
                            <div className="text-[11px] text-faint">Poziție medie în zi · toate</div>
                            <div className={cn("font-mono text-lg", tone(overall.avgPosition))}>{fmtPos(overall.avgPosition)}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" title="În medie, cu cât a fost prețul plătit peste cel mai mic preț al zilei respective.">
                            <div className="text-[11px] text-faint">Peste minimul zilei · medie</div>
                            <div className="font-mono text-lg text-foreground">{fmtAbove(overall.avgAboveLow)}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" title="Câte cumpărări au avut poziția în zi de cel mult 33% (verzi). La întâmplare ar fi cam o treime din total.">
                            <div className="text-[11px] text-faint">În treimea de jos a zilei</div>
                            <div className="font-mono text-lg text-foreground">
                                {overall.lowerThird} <span className="text-sm text-muted">din {overall.n}</span>
                            </div>
                        </div>
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" title="Cea mai mică și cea mai mare poziție în zi dintre toate cumpărările.">
                            <div className="text-[11px] text-faint">Cea mai bună · cea mai slabă</div>
                            <div className="font-mono text-lg">
                                <span className={tone(overall.best)}>{fmtPos(overall.best)}</span> <span className="text-muted">·</span> <span className={tone(overall.worst)}>{fmtPos(overall.worst)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={chartData}
                                onClick={(e) => {
                                    const key = (e as { activePayload?: { payload?: { key?: string } }[] } | null)?.activePayload?.[0]?.payload?.key;
                                    if (key) setPicked(key);
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" minTickGap={8} />
                                <YAxis yAxisId="pos" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickFormatter={(v) => `${v}%`} width={40} />
                                <YAxis yAxisId="above" orientation="right" tick={{ fontSize: 11 }} stroke="rgba(96,165,250,0.6)" tickFormatter={(v) => `+${Number(v).toFixed(1)}%`} width={48} />
                                <Tooltip
                                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                                    contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                    formatter={(v, name) => (name === "pos" ? [`${v}%`, "Poziție medie în zi"] : [fmtAbove(Number(v)), "Peste minim · medie"])}
                                    labelFormatter={(label, items) => {
                                        const n = (items?.[0]?.payload as { n?: number } | undefined)?.n;
                                        return `${label}${n ? ` · ${n} ${n === 1 ? "cumpărare" : "cumpărări"}` : ""}`;
                                    }}
                                />
                                <Bar yAxisId="pos" dataKey="pos" radius={[4, 4, 0, 0]} cursor="pointer">
                                    {chartData.map((d) => (
                                        <Cell key={d.key} fill={fill(d.pos)} fillOpacity={selected?.key === d.key ? 0.95 : 0.45} />
                                    ))}
                                </Bar>
                                <Line yAxisId="above" dataKey="above" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                            Bare = poziția medie în zi (axa din stânga)
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-blue-300">
                            <span className="h-0.5 w-4 rounded bg-blue-400" />
                            Linie = peste minim, în medie (axa din dreapta)
                        </span>
                    </div>

                    {selected && (
                        <div className="mt-6">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-medium text-foreground">
                                    Ordinele din {selected.label}{" "}
                                    <span className="font-normal text-muted">
                                        · {selected.n} {selected.n === 1 ? "cumpărare" : "cumpărări"} · poziție medie <span className={tone(selected.avgPosition)}>{fmtPos(selected.avgPosition)}</span> · peste minim{" "}
                                        {fmtAbove(selected.avgAboveLow)}
                                    </span>
                                </h3>
                                <select
                                    value={selected.key}
                                    onChange={(e) => setPicked(e.target.value)}
                                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
                                >
                                    {[...buckets].reverse().map((b) => (
                                        <option key={b.key} value={b.key} className="bg-[#111]">
                                            {b.label} ({b.n})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-faint">
                                            <SortTh label="Data" k="date" title="Data și ora cumpărării, ora ta locală. Ziua folosită pentru minim și maxim e cea UTC." sort={sort} onSort={toggle} className="py-2 pr-4 font-medium" />
                                            <th className="py-2 pr-4 font-medium" title="DCA / manual = cumpărarea zilnică a botului sau una pornită de tine; Limit (dip) = ordin limit automat la scădere; Limit = ordin limit pus manual.">
                                                Tip
                                            </th>
                                            <SortTh label="Preț cumpărare" k="price" title="Prețul mediu plătit pe 1 SOL la această cumpărare." sort={sort} onSort={toggle} className="py-2 pr-4 font-medium" />
                                            <SortTh label="Minim zi" k="low" title="Cel mai mic preț SOL din ziua respectivă (UTC)." sort={sort} onSort={toggle} className="py-2 pr-4 font-medium" />
                                            <SortTh label="Maxim zi" k="high" title="Cel mai mare preț SOL din ziua respectivă (UTC)." sort={sort} onSort={toggle} className="py-2 pr-4 font-medium" />
                                            <SortTh label="Poziție în zi" k="position" title="Unde a căzut prețul plătit între minimul (0%) și maximul (100%) zilei." sort={sort} onSort={toggle} className="py-2 pr-4 font-medium" />
                                            <SortTh label="Peste minim" k="above" title="Cu cât a fost prețul plătit peste minimul zilei." sort={sort} onSort={toggle} className="py-2 pr-4 font-medium" />
                                            <SortTh label="Sumă" k="amount" title="Câți USDC s-au cheltuit la această cumpărare." sort={sort} onSort={toggle} className="py-2 font-medium" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sorted.map((r) => (
                                            <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                                                <td className="whitespace-nowrap py-2 pr-4 text-muted">
                                                    {format(new Date(r.t), "d MMM yyyy, HH:mm")}
                                                    {r.partial && <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-faint">zi în curs</span>}
                                                </td>
                                                <td className="whitespace-nowrap py-2 pr-4 text-xs text-muted">{r.via === "limit-auto" ? "Limit (dip)" : r.via === "limit" ? "Limit" : "DCA / manual"}</td>
                                                <td className="py-2 pr-4 font-mono text-foreground">{fmt(r.buyPriceUsd)}</td>
                                                <td className="py-2 pr-4 font-mono text-muted">{r.low === null ? "—" : fmt(r.low)}</td>
                                                <td className="py-2 pr-4 font-mono text-muted">{r.high === null ? "—" : fmt(r.high)}</td>
                                                <td className="py-2 pr-4">
                                                    <PositionBar p={r.position} />
                                                </td>
                                                <td className="py-2 pr-4 font-mono text-muted">{fmtAbove(r.aboveLow)}</td>
                                                <td className="py-2 font-mono text-muted">{fmt(r.buyAmountUsd)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <h3 className="text-xs font-medium text-foreground">Verificarea prețurilor · corectitudinea surselor</h3>
                        <p className="mt-0.5 text-[11px] text-muted">
                            Ziua anterioară se închide la verificarea zilnică de la 09:50 UTC; până atunci valorile ei doar se actualizează. După închidere, o dată la 6 ore, platforma reîntreabă ambele surse despre ultimele 3 zile, iar orice schimbare apare la corecții. Corectitudinea = câte dintre zilele închise reverificate au rămas neschimbate.
                        </p>
                        <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-wider text-faint">
                                        <th className="py-1.5 pr-4 font-medium">Sursa</th>
                                        <th className="py-1.5 pr-4 font-medium" title="Zilele închise reverificate în ultimele 30 de zile și câte au fost corectate">Corectitudine · 30 zile</th>
                                        <th className="py-1.5 pr-4 font-medium" title="De la prima cumpărare">Corectitudine · de la început</th>
                                        <th className="py-1.5 font-medium">Ultima verificare</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(history?.sources ?? []).map((s) => (
                                        <tr key={s.name} className="border-b border-white/[0.04] last:border-0">
                                            <td className="py-1.5 pr-4">
                                                <SourceTag name={s.name} /> <span className="text-faint">{s.pair}</span>
                                            </td>
                                            {[s.accuracy.last30, s.accuracy.all].map((a, i) => (
                                                <td key={i} className="py-1.5 pr-4">
                                                    <span className={cn("font-mono", accTone(a.pct))}>{fmtAcc(a.pct)}</span>{" "}
                                                    <span className="text-muted">
                                                        {a.checkedDays === 0 ? "încă nicio zi reverificată" : `${a.correctedDays} ${a.correctedDays === 1 ? "corecție" : "corecții"} din ${a.checkedDays} ${a.checkedDays === 1 ? "zi" : "zile"}`}
                                                    </span>
                                                </td>
                                            ))}
                                            <td className="whitespace-nowrap py-1.5 text-muted">
                                                {s.checkedAt ? format(new Date(s.checkedAt), "d MMM, HH:mm") : "—"}
                                                {s.error && <span className="ml-1.5 text-amber-300" title={s.error}>· eroare la ultima încercare</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <h3 className="mt-4 text-xs font-medium text-foreground">Corecții · ultimele 30 de zile</h3>
                        {(history?.corrections ?? []).length === 0 ? (
                            <p className="mt-1 text-xs text-muted">Nicio corecție: zilele închise au rămas la fel la fiecare reverificare, la ambele surse.</p>
                        ) : (
                            <div className="mt-2 overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-wider text-faint">
                                            <th className="py-1.5 pr-4 font-medium">Ziua</th>
                                            <th className="py-1.5 pr-4 font-medium">Sursa</th>
                                            <th className="py-1.5 pr-4 font-medium">Ce s-a schimbat</th>
                                            <th className="py-1.5 font-medium">Observat</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history!.corrections.map((c) => (
                                            <tr key={`${c.source}-${c.day}-${c.detectedAt}`} className="border-b border-white/[0.04] last:border-0">
                                                <td className="whitespace-nowrap py-1.5 pr-4 text-foreground">{format(new Date(`${c.day}T12:00:00Z`), "d MMM yyyy")}</td>
                                                <td className="py-1.5 pr-4">
                                                    <SourceTag name={c.source} />
                                                </td>
                                                <td className="py-1.5 pr-4 font-mono text-muted">
                                                    {FIELDS.filter(([k]) => Math.abs(c.old[k] - c.new[k]) > 1e-9 * Math.max(1, Math.abs(c.old[k])))
                                                        .map(([k, label]) => `${label} ${fmt(c.old[k])} → ${fmt(c.new[k])}`)
                                                        .join(" · ")}
                                                </td>
                                                <td className="whitespace-nowrap py-1.5 text-muted">{format(new Date(c.detectedAt), "d MMM, HH:mm")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <details open className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <summary className="cursor-pointer select-none text-xs font-medium text-foreground">Legendă · ce înseamnă fiecare</summary>
                        <dl className="mt-3 grid gap-x-8 gap-y-2.5 text-xs sm:grid-cols-2">
                            {[
                                ["Minim zi / Maxim zi", `Cel mai mic și cel mai mare preț SOL din ziua cumpărării, pe zile UTC, acum de la ${source ?? "bursă"}. Coinbase și Binance sunt salvate amândouă; alegi sursa din butoanele de sus. Ziua de azi se actualizează cel mult o dată la 6 ore.`],
                                ["Închiderea zilei", "Ziua se termină la miezul nopții UTC, dar e „închisă” (valori finale) abia la verificarea zilnică de la 09:50 UTC a zilei următoare. Schimbările dintre 00:00 și 09:50 sunt actualizări normale, nu corecții."],
                                ["Verificare și corecții", "Cel mult o dată la 6 ore, plus verificarea zilnică de la 09:50 UTC, platforma reîntreabă ambele surse despre ziua de azi și ultimele 3 zile. Dacă o zi deja închisă își schimbă valorile la o sursă, apare în lista de corecții, cu sursa și valorile vechi și noi."],
                                ["Corectitudine", "Pentru fiecare sursă: din zilele închise reverificate, câte au rămas neschimbate. 100% = sursa nu și-a corectat niciodată datele; o zi corectată de mai multe ori contează o singură dată."],
                                ["Poziție în zi", "Unde a căzut prețul plătit între minimul și maximul zilei: 0% = exact la minim (cel mai bine), 100% = exact la maxim (cel mai rău), 50% = la mijloc."],
                                ["Peste minim", "Cu cât a fost prețul plătit peste minimul zilei, de exemplu +2% = ai plătit cu 2% mai mult decât cel mai mic preț al zilei."],
                                ["Culori", "Verde = treimea de jos a zilei (0–33%), galben = mijloc (33–67%), roșu = treimea de sus (67–100%)."],
                                ["În treimea de jos", "Câte cumpărări au fost verzi. Dacă botul ar cumpăra la o oră la întâmplare, ar fi cam o treime din total."],
                                ["Cea mai bună · cea mai slabă", "Cea mai mică și cea mai mare poziție în zi dintre toate cumpărările."],
                                ["Săptămânal / Lunar / Anual", "Graficul grupează cumpărările pe săptămâni (luni–duminică), luni sau ani; tabelul arată ordinele din perioada aleasă."],
                                ["Zi în curs", "Cumpărare de azi sau de ieri înainte de 09:50 UTC: minimul și maximul zilei nu sunt încă finale și se actualizează o dată la 6 ore."],
                                ["Tip", "DCA / manual = cumpărarea zilnică a botului sau una pornită de tine; Limit (dip) = ordin limit automat la scădere; Limit = ordin limit pus manual."],
                                ["Sub minim", "Botul cumpără prin Jupiter, iar minimul vine de la bursă; rar, prețul plătit iese puțin sub minim. Atunci poziția apare 0% și peste minim ușor negativ."],
                            ].map(([term, text]) => (
                                <div key={term}>
                                    <dt className="font-medium text-foreground">{term}</dt>
                                    <dd className="text-muted">{text}</dd>
                                </div>
                            ))}
                        </dl>
                    </details>
                </>
            )}
        </Card>
    );
}
