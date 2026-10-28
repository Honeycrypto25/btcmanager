"use client";

import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import type { ColdAsset, ColdWalletData, ColdWalletSweep } from "@/app/actions/cold-wallet";

const ASSETS: { key: ColdAsset; chain: string; color: string; decimals: number }[] = [
    { key: "SOL", chain: "Solana", color: "#a970ff", decimals: 4 },
    { key: "EVA", chain: "Solana", color: "#52c98a", decimals: 2 },
    { key: "WETH", chain: "Base", color: "#4c82ff", decimals: 4 },
    { key: "WBNB", chain: "BNB Chain", color: "#f0b90b", decimals: 4 },
    { key: "USDC", chain: "Polygon", color: "#e8875f", decimals: 2 },
];
const ASSET_META = Object.fromEntries(ASSETS.map((a) => [a.key, a])) as Record<ColdAsset, (typeof ASSETS)[number]>;
const MONTHS = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"];

type View = "month" | "year";
type Basis = "at" | "now";

const usd = (v: number) =>
    "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmount = (v: number, a: ColdAsset) =>
    `${v.toLocaleString("en-US", { maximumFractionDigits: ASSET_META[a].decimals, minimumFractionDigits: Math.min(2, ASSET_META[a].decimals) })} ${a}`;
const shortTx = (tx: string) => (tx.length > 14 ? `${tx.slice(0, 6)}…${tx.slice(-4)}` : tx);

export function ColdWalletClient({ data }: { data: ColdWalletData }) {
    const { sweeps, currentPrices, failedCount } = data;

    const years = useMemo(() => {
        const set = new Set(sweeps.map((s) => new Date(s.createdAt).getFullYear()));
        set.add(new Date().getFullYear());
        return Array.from(set).sort((a, b) => b - a);
    }, [sweeps]);

    const [view, setView] = useState<View>("month");
    const [year, setYear] = useState<number>(() => {
        const withData = sweeps.length ? new Date(sweeps[0].createdAt).getFullYear() : new Date().getFullYear();
        return withData;
    });
    const [basis, setBasis] = useState<Basis>("at");
    // History table only: asset filter (empty = all) and 12-row pages.
    const [assetFilter, setAssetFilter] = useState<Set<ColdAsset>>(new Set());
    const [page, setPage] = useState(1);

    function toggleAsset(a: ColdAsset) {
        setAssetFilter((prev) => {
            const next = new Set(prev);
            if (next.has(a)) next.delete(a);
            else next.add(a);
            return next;
        });
        setPage(1);
    }

    const valueAt = (s: ColdWalletSweep) => (s.priceUsd != null ? s.amount * s.priceUsd : 0);
    const valueNow = (s: ColdWalletSweep) => {
        const p = currentPrices[s.asset];
        return p != null ? s.amount * p : valueAt(s);
    };
    const value = (s: ColdWalletSweep) => (basis === "at" ? valueAt(s) : valueNow(s));

    const scoped = useMemo(
        () => (view === "month" ? sweeps.filter((s) => new Date(s.createdAt).getFullYear() === year) : sweeps),
        [sweeps, view, year]
    );

    // Buckets: the 12 months of the selected year, or one per year.
    const buckets = useMemo(() => {
        if (view === "month") {
            return MONTHS.map((label, i) => ({
                label,
                key: `${year}-${i}`,
                items: scoped.filter((s) => new Date(s.createdAt).getMonth() === i),
                rowLabel: `${label} ${year}`,
                monthIndex: i,
            }));
        }
        return [...years].reverse()
            .filter((y) => sweeps.some((s) => new Date(s.createdAt).getFullYear() === y))
            .map((y) => ({
                label: String(y),
                key: String(y),
                items: sweeps.filter((s) => new Date(s.createdAt).getFullYear() === y),
                rowLabel: String(y),
                monthIndex: -1,
            }));
    }, [view, year, scoped, sweeps, years]);

    const chartData = useMemo(
        () =>
            buckets.map((b) => {
                const row: Record<string, number | string> = { label: b.label };
                for (const a of ASSETS) {
                    const v = b.items.filter((s) => s.asset === a.key).reduce((t, s) => t + value(s), 0);
                    row[a.key] = Math.round(v * 100) / 100;
                }
                return row;
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [buckets, basis]
    );

    // Table rows: in the monthly view, from the first month with a sweep up
    // to the current month (or December for a past year), newest first.
    const tableRows = useMemo(() => {
        let rows = buckets;
        if (view === "month") {
            const now = new Date();
            const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;
            const first = buckets.findIndex((b) => b.items.length > 0);
            rows = first === -1 ? [] : buckets.filter((b) => b.monthIndex >= first && b.monthIndex <= lastMonth);
        }
        return [...rows].reverse().map((b) => ({
            key: b.key,
            label: b.rowLabel,
            cells: ASSETS.map((a) => {
                const its = b.items.filter((s) => s.asset === a.key);
                return {
                    key: a.key,
                    usd: its.reduce((t, s) => t + value(s), 0),
                    amount: its.reduce((t, s) => t + s.amount, 0),
                    n: its.length,
                };
            }),
            total: b.items.reduce((t, s) => t + value(s), 0),
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buckets, view, year, basis]);

    const totals = useMemo(() => {
        const total = scoped.reduce((t, s) => t + value(s), 0);
        const totalAt = scoped.reduce((t, s) => t + valueAt(s), 0);
        const totalNow = scoped.reduce((t, s) => t + valueNow(s), 0);
        const activeMonths = new Set(scoped.map((s) => s.createdAt.slice(0, 7))).size;
        const manual = scoped.filter((s) => s.manual).length;
        const estimated = scoped.filter((s) => s.priceSource === "lot-estimate").length;
        const missing = scoped.filter((s) => s.priceUsd == null).length;
        const byAsset = ASSETS.map((a) => {
            const its = scoped.filter((s) => s.asset === a.key);
            const v = its.reduce((t, s) => t + value(s), 0);
            return {
                ...a,
                usd: v,
                amount: its.reduce((t, s) => t + s.amount, 0),
                n: its.length,
                pct: total > 0 ? (v / total) * 100 : 0,
            };
        })
            .filter((a) => a.n > 0)
            .sort((x, y) => y.usd - x.usd);
        return { total, totalAt, totalNow, activeMonths, manual, estimated, missing, byAsset, last: scoped[0]?.createdAt ?? null };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scoped, basis]);

    const diff = totals.totalNow - totals.totalAt;
    const scopeLabel = view === "month" ? String(year) : "toți anii";

    // History table: the period scope, narrowed by the asset chips, 12 per page.
    const PAGE_SIZE = 12;
    const assetsInScope = ASSETS.filter((a) => scoped.some((s) => s.asset === a.key));
    const history = assetFilter.size === 0 ? scoped : scoped.filter((s) => assetFilter.has(s.asset));
    const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageRows = history.slice(pageStart, pageStart + PAGE_SIZE);
    const historyTotalAt = history.reduce((t, s) => t + valueAt(s), 0);

    function exportCsv() {
        const header = ["Data", "Activ", "Retea", "Cantitate", "Pret USD la retragere", "Sursa pret", "USD la retragere", "USD azi", "Tip", "Tranzactie"];
        const lines = history.map((s) => [
            format(new Date(s.createdAt), "yyyy-MM-dd HH:mm"),
            s.asset,
            ASSET_META[s.asset].chain,
            String(s.amount),
            s.priceUsd != null ? s.priceUsd.toFixed(6) : "",
            s.priceSource === "lot-estimate" ? "estimat (pret lot)" : s.priceSource === "recorded" ? "inregistrat" : "",
            valueAt(s).toFixed(2),
            valueNow(s).toFixed(2),
            s.manual ? "manual" : "automat",
            s.txId ?? "",
        ]);
        const csv = [header, ...lines].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const assetPart = assetFilter.size > 0 ? `-${Array.from(assetFilter).join("-").toLowerCase()}` : "";
        a.download = `cold-wallet-${view === "month" ? year : "toti-anii"}${assetPart}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="space-y-6">
            {/* Header + toggles */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Crypto boți · Cold wallet</p>
                    <h1 className="font-display text-2xl font-medium text-foreground">Profit trimis în cold wallet</h1>
                    <p className="max-w-xl text-sm text-muted">
                        Toate retragerile automate și manuale ale boților (Solana, EVA, Base, BNB, Polygon), grupate pe luni și pe ani.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                        label="Perioadă"
                        value={view}
                        onChange={(v) => { setView(v); setPage(1); }}
                        options={[{ value: "month", label: "Lunar" }, { value: "year", label: "Anual" }]}
                    />
                    {view === "month" && years.length > 0 && (
                        <Segmented
                            label="An"
                            value={year}
                            onChange={(y) => { setYear(y); setPage(1); }}
                            options={years.map((y) => ({ value: y, label: String(y) }))}
                        />
                    )}
                    <Segmented
                        label="Bază de calcul USD"
                        value={basis}
                        onChange={setBasis}
                        options={[{ value: "at", label: "USD la retragere" }, { value: "now", label: "USD azi" }]}
                    />
                </div>
            </div>

            {sweeps.length === 0 ? (
                <Card>
                    <p className="text-sm text-muted">
                        Nicio retragere în cold wallet încă. Când un bot face o retragere (automat lunar sau cu „Trimite acum”), apare aici.
                    </p>
                </Card>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Kpi
                            label={`Total scos · ${scopeLabel}`}
                            value={usd(totals.total)}
                            valueClass="text-primary-strong"
                            note={basis === "at" ? "evaluat la prețul din ziua retragerii" : "evaluat la prețul de azi"}
                        />
                        <Kpi
                            label="Valoare azi vs. la retragere"
                            value={usd(totals.totalNow)}
                            note={`${diff >= 0 ? "+" : "−"}${usd(Math.abs(diff))} (${totals.totalAt > 0 ? ((diff / totals.totalAt) * 100).toFixed(1) : "0.0"}%) față de la retragere`}
                            noteClass={diff >= 0 ? "text-emerald-300" : "text-red-300"}
                        />
                        <Kpi
                            label="Retrageri reușite"
                            value={String(scoped.length)}
                            note={`${failedCount} eșuate în total · ${totals.manual} manuale, ${scoped.length - totals.manual} automate`}
                        />
                        <Kpi
                            label="Media pe lună activă"
                            value={usd(totals.activeMonths ? totals.total / totals.activeMonths : 0)}
                            note={totals.last ? `Ultima retragere: ${format(new Date(totals.last), "dd.MM.yyyy")}` : "—"}
                        />
                    </div>

                    {/* Chart */}
                    <Card className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="font-display text-base font-medium text-foreground">
                                {view === "month" ? `Profit scos pe luni · ${year}` : "Profit scos pe ani"}
                            </h2>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                {ASSETS.map((a) => (
                                    <span key={a.key} className="flex items-center gap-2 text-xs text-muted">
                                        <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />
                                        {a.key} <span className="text-faint">· {a.chain}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                                <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickFormatter={(v) => `$${v}`} width={56} />
                                <Tooltip
                                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                                    contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                    formatter={(v, name) => (Number(v) > 0 ? [usd(Number(v)), String(name)] : [null, null])}
                                />
                                {ASSETS.map((a, i) => (
                                    <Bar
                                        key={a.key}
                                        dataKey={a.key}
                                        stackId="sweep"
                                        fill={a.color}
                                        radius={i === ASSETS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                        maxBarSize={56}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        {/* By asset */}
                        <Card className="space-y-4">
                            <h2 className="font-display text-base font-medium text-foreground">Pe active · {scopeLabel}</h2>
                            {totals.byAsset.map((a) => (
                                <div key={a.key} className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span className="flex items-center gap-2 text-foreground">
                                            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />
                                            {a.key}
                                        </span>
                                        <span className="font-mono text-foreground">
                                            {usd(a.usd)} <span className="text-faint">· {a.pct.toFixed(0)}%</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                        <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: a.color }} />
                                    </div>
                                    <p className="font-mono text-xs text-faint">
                                        {fmtAmount(a.amount, a.key)} · {a.n} {a.n === 1 ? "retragere" : "retrageri"}
                                    </p>
                                </div>
                            ))}
                        </Card>

                        {/* Period table */}
                        <Card className="space-y-4">
                            <h2 className="font-display text-base font-medium text-foreground">{view === "month" ? "Detaliu lunar" : "Detaliu anual"}</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-sm">
                                    <thead>
                                        <tr className="border-b border-white/10 text-xs text-faint">
                                            <th scope="col" className="py-2 pr-2 text-left font-medium">{view === "month" ? "Lună" : "An"}</th>
                                            {ASSETS.map((a) => (
                                                <th key={a.key} scope="col" className="px-2 py-2 text-right font-medium">{a.key}</th>
                                            ))}
                                            <th scope="col" className="py-2 pl-2 text-right font-medium">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tableRows.map((r) => (
                                            <tr key={r.key} className="border-b border-white/[0.05]">
                                                <th scope="row" className="py-2.5 pr-2 text-left font-medium text-foreground">{r.label}</th>
                                                {r.cells.map((c) => (
                                                    <td key={c.key} className={cn("px-2 py-2.5 text-right font-mono", c.n ? "text-foreground" : "text-faint")}>
                                                        {c.n ? usd(c.usd) : "—"}
                                                        {c.n > 0 && <div className="text-[11px] text-faint">{fmtAmount(c.amount, c.key)}</div>}
                                                    </td>
                                                ))}
                                                <td className={cn("py-2.5 pl-2 text-right font-mono font-medium", r.total > 0 ? "text-primary-strong" : "text-faint")}>
                                                    {r.total > 0 ? usd(r.total) : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr>
                                            <th scope="row" className="py-3 pr-2 text-left font-semibold text-foreground">Total</th>
                                            {ASSETS.map((a) => {
                                                const t = totals.byAsset.find((b) => b.key === a.key);
                                                return (
                                                    <td key={a.key} className="px-2 py-3 text-right font-mono font-medium text-foreground">
                                                        {t ? usd(t.usd) : "—"}
                                                    </td>
                                                );
                                            })}
                                            <td className="py-3 pl-2 text-right font-mono font-semibold text-primary-strong">{usd(totals.total)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>

                    {/* History */}
                    <Card className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="font-display text-base font-medium text-foreground">Istoric retrageri · {scopeLabel}</h2>
                            <button
                                type="button"
                                onClick={exportCsv}
                                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-primary-strong transition-colors hover:bg-white/[0.04]"
                            >
                                <Download className="h-4 w-4" /> Export CSV
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrează după activ">
                            <button
                                type="button"
                                aria-pressed={assetFilter.size === 0}
                                onClick={() => { setAssetFilter(new Set()); setPage(1); }}
                                className={cn(
                                    "min-h-[32px] rounded-full border px-3 text-xs transition-colors",
                                    assetFilter.size === 0
                                        ? "border-primary/50 bg-primary/15 text-primary-strong"
                                        : "border-white/10 bg-white/[0.03] text-muted hover:text-foreground"
                                )}
                            >
                                Toate · {scoped.length}
                            </button>
                            {assetsInScope.map((a) => {
                                const active = assetFilter.has(a.key);
                                const n = scoped.filter((s) => s.asset === a.key).length;
                                return (
                                    <button
                                        key={a.key}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => toggleAsset(a.key)}
                                        className={cn(
                                            "inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 text-xs transition-colors",
                                            active
                                                ? "border-primary/50 bg-primary/15 text-primary-strong"
                                                : "border-white/10 bg-white/[0.03] text-muted hover:text-foreground"
                                        )}
                                    >
                                        <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: a.color }} />
                                        {a.key} · {n}
                                    </button>
                                );
                            })}
                            {assetFilter.size > 0 && (
                                <span className="ml-1 text-xs text-faint">
                                    {history.length} {history.length === 1 ? "retragere" : "retrageri"} · {usd(historyTotalAt)} la retragere
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="border-b border-white/10 text-xs text-faint">
                                        <th scope="col" className="py-2 pr-2 text-left font-medium">Data</th>
                                        <th scope="col" className="px-2 py-2 text-left font-medium">Activ</th>
                                        <th scope="col" className="px-2 py-2 text-right font-medium">Cantitate</th>
                                        <th scope="col" className="px-2 py-2 text-right font-medium">Preț la retragere</th>
                                        <th scope="col" className="px-2 py-2 text-right font-medium">USD la retragere</th>
                                        <th scope="col" className="px-2 py-2 text-right font-medium">USD azi</th>
                                        <th scope="col" className="px-2 py-2 text-left font-medium">Tip</th>
                                        <th scope="col" className="py-2 pl-2 text-left font-medium">Tranzacție</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.map((s) => {
                                        const est = s.priceSource === "lot-estimate";
                                        return (
                                            <tr key={`${s.asset}-${s.id}`} className="border-b border-white/[0.05]">
                                                <td className="py-2.5 pr-2 font-mono text-muted">{format(new Date(s.createdAt), "dd.MM.yyyy")}</td>
                                                <td className="px-2 py-2.5">
                                                    <span className="inline-flex items-center gap-2 text-foreground">
                                                        <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: ASSET_META[s.asset].color }} />
                                                        {s.asset} <span className="text-faint">{ASSET_META[s.asset].chain}</span>
                                                    </span>
                                                </td>
                                                <td className="px-2 py-2.5 text-right font-mono text-foreground">{fmtAmount(s.amount, s.asset)}</td>
                                                <td className="px-2 py-2.5 text-right font-mono text-muted" title={est ? "Estimat din prețul de cumpărare al celui mai apropiat lot" : undefined}>
                                                    {s.priceUsd != null ? `${est ? "≈ " : ""}${usd(s.priceUsd)}` : "—"}
                                                </td>
                                                <td className="px-2 py-2.5 text-right font-mono text-primary-strong">
                                                    {s.priceUsd != null ? `${est ? "≈ " : ""}${usd(valueAt(s))}` : "—"}
                                                </td>
                                                <td className="px-2 py-2.5 text-right font-mono text-foreground">{usd(valueNow(s))}</td>
                                                <td className="px-2 py-2.5">
                                                    <span className="inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted">
                                                        {s.manual ? "Manual" : "Automat"}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 pl-2 font-mono">
                                                    {s.txUrl && s.txId ? (
                                                        <a href={s.txUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-strong hover:underline">
                                                            {shortTx(s.txId)} <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-faint">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {history.length > PAGE_SIZE && (
                            <nav aria-label="Paginare istoric" className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                                <span>
                                    {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, history.length)} din {history.length}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setPage(currentPage - 1)}
                                        disabled={currentPage <= 1}
                                        aria-label="Pagina anterioară"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-muted transition-colors hover:text-foreground disabled:opacity-40"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setPage(p)}
                                            aria-current={p === currentPage ? "page" : undefined}
                                            className={cn(
                                                "h-8 min-w-[32px] rounded-lg px-2 font-mono transition-colors",
                                                p === currentPage ? "bg-primary/15 text-primary-strong" : "text-muted hover:text-foreground"
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setPage(currentPage + 1)}
                                        disabled={currentPage >= totalPages}
                                        aria-label="Pagina următoare"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-muted transition-colors hover:text-foreground disabled:opacity-40"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </nav>
                        )}
                        {(totals.estimated > 0 || totals.missing > 0) && (
                            <p className="text-xs text-faint">
                                {totals.estimated > 0 &&
                                    `≈ ${totals.estimated} ${totals.estimated === 1 ? "retragere veche" : "retrageri vechi"} fără preț salvat: valoarea e estimată din prețul de cumpărare al celui mai apropiat lot (±3 zile). `}
                                {totals.missing > 0 && `${totals.missing} fără niciun preț disponibil (numărate ca $0 la retragere).`}
                            </p>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}

function Kpi({ label, value, note, valueClass, noteClass }: { label: string; value: string; note: string; valueClass?: string; noteClass?: string }) {
    return (
        <Card className="space-y-1.5 p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>
            <p className={cn("font-mono text-2xl font-medium", valueClass ?? "text-foreground")}>{value}</p>
            <p className={cn("text-xs", noteClass ?? "text-muted")}>{note}</p>
        </Card>
    );
}

function Segmented<T extends string | number>({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string }[];
}) {
    return (
        <div role="group" aria-label={label} className="flex gap-1 rounded-xl border border-white/[0.08] bg-surface p-1">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={String(o.value)}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "min-h-[36px] rounded-lg px-3.5 text-sm transition-colors",
                            active ? "bg-primary/15 font-medium text-primary-strong" : "text-muted hover:text-foreground"
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
