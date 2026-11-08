"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import Link from "next/link";
import type { LendOverview, LendPositionFull } from "@/lib/solana/jupiter-lend";
import { BorrowRoom, InterestTiles, PnlCard, ProfitabilityCard } from "@/components/cold-wallet/LendCharts";

const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number | null, d = 2) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
// Fixed time zone so the server render and the browser agree (a plain
// date-fns format() uses each side's own zone and triggers a hydration mismatch).
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
// Candle days are UTC days; fixed zone keeps server and browser identical.
const dayUtc = (iso: string) => new Date(iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ago = (days: number) => {
    if (days >= 365) {
        const y = Math.floor(days / 365);
        const m = Math.floor((days % 365) / 30);
        return m > 0 ? `${plural(y, "an", "ani")} și ${plural(m, "lună", "luni")}` : plural(y, "an", "ani");
    }
    if (days >= 30) return plural(Math.floor(days / 30), "lună", "luni");
    return plural(days, "zi", "zile");
};
// Track colours, left (safe) to right (liquidation). The fill is a window onto this gradient,
// so the colour at its tip always matches the position.
const RISK_STOPS: [number, [number, number, number]][] = [
    [0, [16, 214, 143]],
    [0.5, [250, 204, 21]],
    [0.75, [251, 146, 60]],
    [1, [239, 68, 68]],
];
const RISK_GRADIENT = `linear-gradient(to right, ${RISK_STOPS.map(([at, c]) => `rgb(${c.join(",")}) ${at * 100}%`).join(", ")})`;
const riskColor = (r: number) => {
    const x = Math.max(0, Math.min(1, r));
    for (let i = 1; i < RISK_STOPS.length; i++) {
        const [b, cb] = RISK_STOPS[i];
        const [a, ca] = RISK_STOPS[i - 1];
        if (x <= b) {
            const k = (x - a) / (b - a);
            return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(",")})`;
        }
    }
    return "rgb(239,68,68)";
};
const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** Jupiter Lend borrow positions held by the cold wallet — read-only. */
export function LendPositions({ lend, capLtv = 0.3 }: { lend: LendOverview; capLtv?: number }) {
    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-medium text-foreground">Împrumuturi Jupiter Lend</h2>
                    <p className="text-xs text-muted">
                        {lend.configured
                            ? `Poziții deschise în ${lend.wallets.map(short).join(", ")} · actualizat ${hhmm(lend.fetchedAt)}`
                            : "Niciun portofel configurat"}
                    </p>
                </div>
                {lend.positions.length > 0 && (
                    <Link href="/cold-wallet/imprumuturi/tranzactii" className="text-xs text-primary-strong hover:underline">
                        Vezi tranzacțiile →
                    </Link>
                )}
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
                    {lend.historyError && (
                        <p className="text-xs text-amber-300">Nu am putut citi istoricul tranzacțiilor ({lend.historyError}) — dobânzile și graficele de istoric lipsesc, restul e afișat.</p>
                    )}
                    {lend.positions.map((p) => (
                        <PositionCard key={`${p.vaultId}-${p.id}`} p={p} capLtv={capLtv} />
                    ))}
                </div>
            )}
        </Card>
    );
}

function PositionCard({ p, capLtv }: { p: LendPositionFull; capLtv: number }) {
    const lt = p.liqThreshold ?? 0;
    // Same zones jup.ag uses visually: well below max LTV is safe, close to the liquidation threshold is danger.
    const risk = lt > 0 ? p.ltv / lt : 0;
    const tone = risk < 0.6 ? "safe" : risk < 0.85 ? "warn" : "danger";
    const fillPct = Math.max(2, Math.min(100, risk * 100));
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Mini label="Preț lichidare" value={p.liqPrice == null ? "—" : `${amt(p.liqPrice, 1)} ${p.debt.symbol}`} />
                <Mini label="Distanță până la lichidare" value={pct(p.liqOffset, 1)} />
                <Mini label={`Preț ${p.collateral.symbol} acum`} value={usd(p.collateral.priceUsd)} />
                {p.extras.oracle && (
                    <Mini
                        label="Preț oracol (după care se lichidează)"
                        value={`${usd(p.extras.oracle.priceUsd)} (${p.extras.oracle.diffPct >= 0 ? "+" : "−"}${(Math.abs(p.extras.oracle.diffPct) * 100).toFixed(2)}% față de piață)`}
                    />
                )}
                <Mini label="LTV max / Lichidare / Penalizare" value={`${pct(p.maxLtv, 0)} / ${pct(p.liqThreshold, 0)} / ${pct(p.liqPenalty, 0)}`} />
            </div>

            {p.liqHistory && <LiqSeen h={p.liqHistory} />}

            <ProfitabilityCard p={p} />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <PnlCard p={p} />
                <BorrowRoom p={p} capLtv={capLtv} />
            </div>

            <InterestTiles p={p} />

            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Sănătate poziție (LTV)</span>
                    <span className="font-mono" style={{ color: riskColor(risk) }}>
                        {toneLabel} · {pct(p.ltv)}
                    </span>
                </div>
                {/* Pill outline like a loading bar; the fill shows the slice of the green→red track up to the current position. */}
                <div className="rounded-full border border-white/20 p-[3px]">
                    <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                            className="h-full rounded-full"
                            style={{
                                width: `${fillPct}%`,
                                backgroundImage: RISK_GRADIENT,
                                backgroundSize: `${fillPct > 0 ? 10000 / fillPct : 100}% 100%`,
                                backgroundRepeat: "no-repeat",
                            }}
                        />
                    </div>
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

/** When the collateral was last as low as the liquidation price. */
function LiqSeen({ h }: { h: NonNullable<LendPositionFull["liqHistory"]> }) {
    return (
        <div className="space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Prețul de lichidare în istoric</p>
            {h.lastAtOrBelow ? (
                <p className="text-sm text-foreground">
                    Ultima dată când {h.symbol} a fost la sau sub {usd(h.level)}: <span className="font-mono">{dayUtc(h.lastAtOrBelow.at)}</span>{" "}
                    <span className="text-muted">
                        (acum {ago(h.lastAtOrBelow.daysAgo)} · minimul acelei zile {usd(h.lastAtOrBelow.low)})
                    </span>
                </p>
            ) : (
                <p className="text-sm text-foreground">
                    {h.symbol} nu a fost niciodată la sau sub {usd(h.level)} de la {dayUtc(h.coverageFrom)} (primele date disponibile).
                </p>
            )}
            {h.min12m && (
                <p className="text-muted">
                    Minimul ultimelor 12 luni: {usd(h.min12m.low)} pe {dayUtc(h.min12m.at)}. Sursa: prețuri zilnice Binance, pe minimul zilei.
                </p>
            )}
        </div>
    );
}
