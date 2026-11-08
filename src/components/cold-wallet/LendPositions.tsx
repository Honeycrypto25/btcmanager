"use client";

import React from "react";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import type { LendData, LendPosition } from "@/lib/solana/jupiter-lend";

const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number | null, d = 2) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** Jupiter Lend borrow positions held by the cold wallet — read-only. */
export function LendPositions({ lend }: { lend: LendData }) {
    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-medium text-foreground">Împrumuturi Jupiter Lend</h2>
                    <p className="text-xs text-muted">
                        {lend.configured
                            ? `Poziții deschise în ${lend.wallets.map(short).join(", ")} · actualizat ${format(new Date(lend.fetchedAt), "HH:mm")}`
                            : "Niciun portofel configurat"}
                    </p>
                </div>
            </div>

            {!lend.configured ? (
                <p className="text-sm text-muted">
                    Setează <code>JUPITER_LEND_WALLETS</code> (sau <code>SOLANA_SWEEP_DESTINATION</code>) în Vercel cu adresa care deține poziția.
                </p>
            ) : lend.error ? (
                <p className="text-sm text-red-300">Nu am putut citi pozițiile: {lend.error}</p>
            ) : lend.positions.length === 0 ? (
                <p className="text-sm text-muted">
                    Nicio poziție de împrumut găsită în aceste portofele. Dacă poziția e în alt portofel, adaugă adresa în <code>JUPITER_LEND_WALLETS</code> (separate prin virgulă).
                </p>
            ) : (
                <div className="space-y-4">
                    {lend.positions.map((p) => (
                        <PositionCard key={`${p.vaultId}-${p.id}`} p={p} />
                    ))}
                </div>
            )}
        </Card>
    );
}

function PositionCard({ p }: { p: LendPosition }) {
    const lt = p.liqThreshold ?? 0;
    // Same zones jup.ag uses visually: well below max LTV is safe, close to the liquidation threshold is danger.
    const risk = lt > 0 ? p.ltv / lt : 0;
    const tone = risk < 0.6 ? "safe" : risk < 0.85 ? "warn" : "danger";
    const toneText = { safe: "text-emerald-300", warn: "text-amber-300", danger: "text-red-300" }[tone];
    const toneBar = { safe: "bg-emerald-400", warn: "bg-amber-400", danger: "bg-red-400" }[tone];
    const toneLabel = { safe: "Sigur", warn: "Atenție", danger: "Risc mare" }[tone];

    return (
        <div className="space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">
                    {p.collateral.symbol} / {p.debt.symbol} <span className="font-mono text-sm text-faint">#{p.id}</span>
                </p>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-strong hover:underline">
                    Deschide în Jupiter <ExternalLink className="h-3 w-3" />
                </a>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Colateral" value={`${amt(p.collateral.amount)} ${p.collateral.symbol}`} note={`${usd(p.collateral.usd)} · APY ${pct(p.collateral.apy)}`} noteClass="text-emerald-300/80" />
                <Stat label="Datorie" value={`${amt(p.debt.amount)} ${p.debt.symbol}`} note={`${usd(p.debt.usd)} · APY ${pct(p.debt.apy)}`} noteClass="text-amber-300/80" />
                <Stat label="Net USD" value={usd(p.netUsd)} note={`Net APY ${p.netApy == null ? "—" : `${p.netApy >= 0 ? "+" : ""}${pct(p.netApy)}`}`} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Mini label="Preț lichidare" value={p.liqPrice == null ? "—" : `${amt(p.liqPrice, 1)} ${p.debt.symbol}`} />
                <Mini label="Distanță până la lichidare" value={pct(p.liqOffset, 1)} />
                <Mini label={`Preț ${p.collateral.symbol} acum`} value={usd(p.collateral.priceUsd)} />
                <Mini label="LTV max / Lichidare / Penalizare" value={`${pct(p.maxLtv, 0)} / ${pct(p.liqThreshold, 0)} / ${pct(p.liqPenalty, 0)}`} />
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Sănătate poziție (LTV)</span>
                    <span className={cn("font-mono", toneText)}>
                        {toneLabel} · {pct(p.ltv)}
                    </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full", toneBar)} style={{ width: `${Math.min(100, lt > 0 ? (p.ltv / lt) * 100 : 0)}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-faint">
                    <span>0%</span>
                    <span>Lichidare la {pct(p.liqThreshold, 0)}</span>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value, note, noteClass }: { label: string; value: string; note: string; noteClass?: string }) {
    return (
        <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>
            <p className="font-mono text-lg font-medium text-foreground">{value}</p>
            <p className={cn("text-xs", noteClass ?? "text-muted")}>{note}</p>
        </div>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-0.5">
            <p className="text-[11px] text-faint">{label}</p>
            <p className="font-mono text-sm text-foreground">{value}</p>
        </div>
    );
}
