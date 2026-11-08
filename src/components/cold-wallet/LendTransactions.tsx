"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import type { LendAction, LendOverview, LendPositionFull } from "@/lib/solana/jupiter-lend";
import { tokenSmall, usdSmall } from "@/components/cold-wallet/LendCharts";

const PAGE = 12;

const TYPE_LABEL: Record<string, string> = {
    deposit: "Depunere",
    borrow: "Împrumut",
    payback: "Rambursare",
    withdraw: "Retragere",
    multiply: "Multiply",
    unwind: "Unwind",
};
const TYPE_TONE: Record<string, string> = {
    deposit: "bg-emerald-400/10 text-emerald-300",
    borrow: "bg-amber-400/10 text-amber-300",
    payback: "bg-sky-400/10 text-sky-300",
    withdraw: "bg-rose-400/10 text-rose-300",
};

// Fixed zone so server render and browser agree (no hydration mismatch).
const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" });
const shortSig = (s: string) => (s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);

type Row = LendAction & { pos: LendPositionFull };

const csvCell = (v: string | number) => {
    const t = String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
/** All rows of the current filter as a CSV (UTC dates, token units and USD at the time of each transaction). */
function downloadCsv(rows: Row[]) {
    const head = ["data_utc", "tip", "pozitie", "status", "colateral_intrat", "colateral_iesit", "datorie_intrata", "datorie_iesita", "colateral_intrat_usd", "colateral_iesit_usd", "datorie_intrata_usd", "datorie_iesita_usd", "semnatura"];
    const lines = rows.map((r) =>
        [
            new Date(r.at).toISOString(),
            r.type,
            `${r.pos.collateral.symbol}/${r.pos.debt.symbol} #${r.pos.id}`,
            r.status,
            r.collateralIn,
            r.collateralOut,
            r.debtIn,
            r.debtOut,
            r.collateralInUsd,
            r.collateralOutUsd,
            r.debtInUsd,
            r.debtOutUsd,
            r.signature,
        ]
            .map(csvCell)
            .join(",")
    );
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `imprumuturi-tranzactii-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function LendTransactions({ lend }: { lend: LendOverview }) {
    const [type, setType] = useState<string>("all");
    const [page, setPage] = useState(1);

    const rows: Row[] = useMemo(
        () => lend.positions.flatMap((p) => (p.actions ?? []).map((a) => ({ ...a, pos: p }))).sort((a, b) => (a.at < b.at ? 1 : -1)),
        [lend.positions]
    );
    const types = useMemo(() => Array.from(new Set(rows.map((r) => r.type))), [rows]);
    const filtered = type === "all" ? rows : rows.filter((r) => r.type === type);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
    const cur = Math.min(page, pages);
    const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);

    const ok = rows.filter((r) => r.status === "success");
    const sum = (f: (r: Row) => number) => ok.reduce((s, r) => s + f(r), 0);
    const first = lend.positions[0];
    const colSym = first?.collateral.symbol ?? "";
    const debtSym = first?.debt.symbol ?? "";

    if (!lend.configured) {
        return (
            <Card>
                <p className="text-sm text-muted">
                    Setează <code>JUPITER_LEND_WALLETS</code> în Vercel cu adresa care deține poziția.
                </p>
            </Card>
        );
    }
    if (lend.error) {
        return (
            <Card>
                <p className="text-sm text-red-300">Nu am putut citi pozițiile: {lend.error}</p>
            </Card>
        );
    }
    if (lend.historyError) {
        return (
            <Card>
                <p className="text-sm text-red-300">Nu am putut citi istoricul tranzacțiilor: {lend.historyError}</p>
            </Card>
        );
    }
    if (rows.length === 0) {
        return (
            <Card>
                <p className="text-sm text-muted">Nicio tranzacție găsită pentru pozițiile deschise.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Kpi label="Tranzacții" value={String(ok.length)} note={rows.length !== ok.length ? `${rows.length - ok.length} eșuate` : "toate reușite"} />
                <Kpi
                    label="Total depus"
                    value={tokenSmall(sum((r) => r.collateralIn - r.collateralOut), colSym)}
                    note={`${usdSmall(sum((r) => r.collateralInUsd - r.collateralOutUsd))} la momentul depunerilor`}
                />
                <Kpi
                    label="Total împrumutat"
                    value={tokenSmall(sum((r) => r.debtIn - r.debtOut), debtSym)}
                    note={`${usdSmall(sum((r) => r.debtInUsd - r.debtOutUsd))} la momentul împrumuturilor`}
                />
                <Kpi label="Prima tranzacție" value={fmtDay(rows[rows.length - 1].at)} note={fmtTime(rows[rows.length - 1].at)} />
            </div>

            <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <h2 className="font-display text-base font-medium text-foreground">Istoric · {filtered.length} tranzacții</h2>
                        <button
                            type="button"
                            onClick={() => downloadCsv(filtered)}
                            disabled={filtered.length === 0}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
                        >
                            <Download className="h-3 w-3" /> CSV
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtru tip">
                        {["all", ...types].map((t) => (
                            <button
                                key={t}
                                type="button"
                                aria-pressed={type === t}
                                onClick={() => {
                                    setType(t);
                                    setPage(1);
                                }}
                                className={cn(
                                    "min-h-[32px] rounded-full border px-3 text-xs transition-colors",
                                    type === t ? "border-primary/50 bg-primary/10 text-foreground" : "border-white/10 bg-white/[0.03] text-muted hover:border-white/20"
                                )}
                            >
                                {t === "all" ? "Toate" : TYPE_LABEL[t] ?? t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-faint">
                                <th className="py-2 pr-4 font-medium">Data</th>
                                <th className="py-2 pr-4 font-medium">Tip</th>
                                <th className="py-2 pr-4 font-medium">Poziție</th>
                                <th className="py-2 pr-4 text-right font-medium">Colateral</th>
                                <th className="py-2 pr-4 text-right font-medium">Datorie</th>
                                <th className="py-2 pr-4 text-right font-medium">Valoare la momentul tx</th>
                                <th className="py-2 pr-4 font-medium">Status</th>
                                <th className="py-2 font-medium">Tx</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r) => (
                                <tr key={`${r.pos.id}-${r.id}`} className="border-b border-white/[0.04] last:border-0">
                                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-xs text-muted">{fmtDate(r.at)}</td>
                                    <td className="py-2.5 pr-4">
                                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", TYPE_TONE[r.type] ?? "bg-white/[0.06] text-muted")}>{TYPE_LABEL[r.type] ?? r.type}</span>
                                    </td>
                                    <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted">
                                        {r.pos.collateral.symbol}/{r.pos.debt.symbol} #{r.pos.id}
                                    </td>
                                    <td className="whitespace-nowrap py-2.5 pr-4 text-right font-mono text-xs">{flow(r.collateralIn, r.collateralOut, r.pos.collateral.symbol)}</td>
                                    <td className="whitespace-nowrap py-2.5 pr-4 text-right font-mono text-xs">{flow(r.debtIn, r.debtOut, r.pos.debt.symbol)}</td>
                                    <td className="whitespace-nowrap py-2.5 pr-4 text-right font-mono text-xs text-foreground">
                                        {usdSmall(r.collateralInUsd + r.collateralOutUsd + r.debtInUsd + r.debtOutUsd)}
                                    </td>
                                    <td className="py-2.5 pr-4">
                                        <span className={cn("text-xs", r.status === "success" ? "text-emerald-300" : "text-amber-300")}>{r.status === "success" ? "Reușită" : r.status}</span>
                                    </td>
                                    <td className="py-2.5">
                                        <a
                                            href={`https://solscan.io/tx/${r.signature}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-mono text-xs text-primary-strong hover:underline"
                                        >
                                            {shortSig(r.signature)} <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {pages > 1 && (
                    <div className="flex items-center justify-between text-xs text-muted">
                        <span>
                            Pagina {cur} din {pages}
                        </span>
                        <div className="flex gap-1">
                            <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="rounded-lg border border-white/10 p-1.5 disabled:opacity-30" aria-label="Pagina anterioară">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="rounded-lg border border-white/10 p-1.5 disabled:opacity-30" aria-label="Pagina următoare">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
                <p className="text-[11px] text-faint">Sursa: API-ul public Fluid, același pe care îl citește tab-ul „History” din Jupiter Lend. Nu include lichidări.</p>
            </Card>
        </div>
    );
}

/** +x when put in, −x when taken out, — when untouched. */
function flow(inAmt: number, outAmt: number, sym: string) {
    if (inAmt > 0 && outAmt > 0) return `${tokenSmall(inAmt - outAmt, sym)}`;
    if (inAmt > 0) return <span className="text-emerald-300">+{tokenSmall(inAmt, sym)}</span>;
    if (outAmt > 0) return <span className="text-rose-300">−{tokenSmall(outAmt, sym)}</span>;
    return <span className="text-faint">—</span>;
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
    return (
        <Card className="space-y-1 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>
            <p className="font-mono text-lg font-medium text-foreground">{value}</p>
            <p className="text-xs text-muted">{note}</p>
        </Card>
    );
}
