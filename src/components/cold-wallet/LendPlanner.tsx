"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import type { LendPositionFull } from "@/lib/solana/jupiter-lend";
import type { BotOverview } from "@/components/cold-wallet/LendBotFuel";
import { ProfitVsInterestChart } from "@/components/cold-wallet/ProfitVsInterestChart";

const usd = (v: number) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const TONE = { good: "text-emerald-300", warn: "text-amber-300", bad: "text-red-300", none: "text-foreground" } as const;
type Tone = keyof typeof TONE;

function Tile({ label, value, note, tone = "none" }: { label: string; value: string; note?: string; tone?: Tone }) {
    return (
        <div className="space-y-0.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>
            <p className={cn("font-mono text-lg font-medium", TONE[tone])}>{value}</p>
            {note && <p className="text-[11px] text-muted">{note}</p>}
        </div>
    );
}

/** Red/amber strip when the LTV is at or near the user's own ceiling. */
export function LendAlert({ positions, capLtv }: { positions: LendPositionFull[]; capLtv: number }) {
    const hot = positions.filter((p) => p.ltv >= capLtv * 0.95);
    if (hot.length === 0) return null;
    return (
        <div className="space-y-1">
            {hot.map((p) => {
                const over = p.ltv >= capLtv;
                return (
                    <div
                        key={`${p.vaultId}-${p.id}`}
                        className={cn(
                            "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
                            over ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-amber-400/40 bg-amber-500/10 text-amber-200"
                        )}
                    >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                            {p.collateral.symbol} / {p.debt.symbol} #{p.id}: LTV {pct(p.ltv, 2)} —{" "}
                            {over ? `peste plafonul tău de ${pct(capLtv, 0)}. Nu mai împrumuta; adaugă colateral sau returnează.` : `aproape de plafonul tău de ${pct(capLtv, 0)}.`}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

/** Planning tools for the start of the month: coverage, exposure, bot vs interest, simulator, price scenarios. */
export function LendPlanner({ p, bot, capLtv }: { p: LendPositionFull; bot: BotOverview; capLtv: number }) {
    return (
        <Card className="space-y-6">
            <div>
                <h2 className="font-display text-base font-medium text-foreground">Planificare</h2>
                <p className="text-xs text-muted">
                    {p.collateral.symbol} / {p.debt.symbol} #{p.id} · plafonul tău de LTV: {pct(capLtv, 0)}
                </p>
            </div>
            <Coverage p={p} bot={bot} capLtv={capLtv} />
            <Exposure p={p} bot={bot} />
            <BotVsInterest p={p} bot={bot} />
            <Simulator p={p} capLtv={capLtv} />
            <Scenarios p={p} capLtv={capLtv} />
        </Card>
    );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                {hint && <p className="text-xs text-muted">{hint}</p>}
            </div>
            {children}
        </div>
    );
}

/** 3. Will the month be covered: USDC in the bot wallet + what the cap still lets you borrow vs what the bot spends. */
function Coverage({ p, bot, capLtv }: { p: LendPositionFull; bot: BotOverview; capLtv: number }) {
    const fuel = bot.fuel;
    if (!fuel) return <Section title="Acoperirea lunii" hint="Portofelul botului nu poate fi citit acum.">{null}</Section>;
    const need = fuel.intervalHours > 0 ? fuel.buyAmountUsd * ((30 * 24) / fuel.intervalHours) : 0;
    const room = Math.max(0, p.collateral.usd * capLtv - p.debt.usd);
    const available = fuel.usdcBalance + room;
    const gap = available - need;
    const ok = gap >= 0;
    const days = need > 0 ? available / (need / 30) : 0;
    return (
        <Section title="Acoperirea lunii" hint="Ce are botul la dispoziție (USDC în portofel + cât mai poți împrumuta până la plafon) față de ce cheltuie în 30 de zile. USDC-ul care revine din vânzări nu e numărat, deci estimarea e prudentă.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label="Necesar 30 de zile" value={usd(need)} note={`${usd(fuel.buyAmountUsd)} la ${fuel.intervalHours}h`} />
                <Tile label="USDC în portofel" value={usd(fuel.usdcBalance)} />
                <Tile label="Mai poți împrumuta" value={usd(room)} note={`până la LTV ${pct(capLtv, 0)}`} />
                <Tile
                    label={ok ? "Luna e acoperită" : "Lipsesc pentru lună"}
                    value={usd(Math.abs(gap))}
                    note={ok ? `surplus · ≈ ${Math.floor(days)} zile acoperite` : `acoperi ≈ ${Math.floor(days)} din 30 de zile`}
                    tone={ok ? "good" : "bad"}
                />
            </div>
        </Section>
    );
}

/** 2. Total SOL exposure: collateral in Lend + SOL waiting in the bot's sell orders. */
function Exposure({ p, bot }: { p: LendPositionFull; bot: BotOverview }) {
    const pendUsd = bot.pending?.usd ?? 0;
    const total = p.collateral.usd + pendUsd;
    const net = total - p.debt.usd;
    return (
        <Section title="Expunere totală la SOL" hint="Colateralul din Lend plus SOL-ul din ordinele pending ale botului. Prețul de lichidare din Jupiter îl vede doar pe primul.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label="În Lend (colateral)" value={usd(p.collateral.usd)} note={`${p.collateral.amount.toFixed(4)} ${p.collateral.symbol}`} />
                <Tile label="În ordine pending" value={usd(pendUsd)} note={bot.pending ? `${bot.pending.sol.toFixed(4)} SOL · ${bot.pending.count} ordine` : "indisponibil"} />
                <Tile label="Expunere totală" value={usd(total)} />
                <Tile label="Minus datoria" value={usd(net)} note={`o scădere de 10% a SOL ≈ ${usd(-total * 0.1)}`} />
            </div>
        </Section>
    );
}

/** 4. What the bot made in the last 30 days vs the interest the loan costs. */
function BotVsInterest({ p, bot }: { p: LendPositionFull; bot: BotOverview }) {
    const r = bot.realized30d;
    if (!r || !p.interest) return null;
    // A young position hasn't paid 30 days of interest yet: show what's paid and what a full month costs.
    const paidSoFar = p.interest.paidUsd;
    const month = p.interest.projection.month.paidUsd;
    const left = r.usd - month;
    return (
        <Section title="Profitul botului față de dobânda plătită" hint="Profitul realizat din loturile vândute în ultimele 30 de zile, față de costul dobânzii pe un împrumut cât al tău.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label="Profit bot · 30 zile" value={usd(r.usd)} note={`${r.count} loturi vândute`} tone={r.usd >= 0 ? "good" : "bad"} />
                <Tile label="Dobândă / 30 zile" value={usd(month)} note={`la ratele de azi · plătit până acum ${usd(paidSoFar)}`} />
                <Tile label="Rămâne" value={usd(left)} tone={left >= 0 ? "good" : "bad"} note={left >= 0 ? "botul acoperă dobânda" : "botul nu acoperă dobânda"} />
                <Tile label="Raport" value={month > 0 ? `${(r.usd / month).toFixed(1)}×` : "—"} note="profit bot ÷ dobândă" />
            </div>
            <ProfitVsInterestChart p={p} profits={bot.profits} />
        </Section>
    );
}

/** 1. What-if: borrow / repay USDC or add SOL — the new LTV, liquidation price and interest. */
function Simulator({ p, capLtv }: { p: LendPositionFull; capLtv: number }) {
    const [mode, setMode] = useState<"borrow" | "repay" | "add">("borrow");
    const [raw, setRaw] = useState("100");
    const x = Math.max(0, Number(raw.replace(",", ".")) || 0);
    const lt = p.liqThreshold ?? 0.85;
    let col = p.collateral.amount;
    let debt = p.debt.amount;
    if (mode === "borrow") debt += x / p.debt.priceUsd;
    else if (mode === "repay") debt = Math.max(0, debt - x / p.debt.priceUsd);
    else col += x;
    const colUsd = col * p.collateral.priceUsd;
    const debtUsd = debt * p.debt.priceUsd;
    const ltv = colUsd > 0 ? debtUsd / colUsd : 0;
    const liq = col * lt > 0 ? debtUsd / (col * lt) : null;
    const yearly = (c: number, d: number) => c * p.collateral.priceUsd * (p.collateral.apy ?? 0) - d * p.debt.priceUsd * (p.debt.apy ?? 0);
    const dNet = yearly(col, debt) - yearly(p.collateral.amount, p.debt.amount);
    const room = Math.max(0, p.collateral.usd * capLtv - p.debt.usd);
    const over = ltv > capLtv;
    const unit = mode === "add" ? p.collateral.symbol : "USD";
    return (
        <Section title="Simulator" hint="Scrii o sumă și vezi cum s-ar schimba poziția. Nu face nicio tranzacție.">
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 text-xs">
                    {([["borrow", "Împrumut USDC"], ["repay", "Returnez USDC"], ["add", `Adaug ${p.collateral.symbol}`]] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setMode(k)} className={cn("rounded-md px-3 py-1 transition-colors", mode === k ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground")}>
                            {l}
                        </button>
                    ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                    Sumă
                    <input
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        className="w-28 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-sm text-foreground outline-none focus:border-primary/50"
                    />
                    {unit}
                </label>
                {mode === "borrow" && room > 0 && (
                    <button type="button" onClick={() => setRaw(room.toFixed(2))} className="text-xs text-primary-strong hover:underline">
                        până la plafon ({usd(room)})
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label="LTV nou" value={pct(ltv, 2)} note={`acum ${pct(p.ltv, 2)} · plafon ${pct(capLtv, 0)}`} tone={ltv >= lt ? "bad" : over ? "warn" : "good"} />
                <Tile label="Preț lichidare nou" value={liq == null ? "—" : usd(liq)} note={p.liqPriceUsd ? `acum ${usd(p.liqPriceUsd)}` : undefined} />
                <Tile label="Datorie după" value={usd(debtUsd)} note={`colateral ${usd(colUsd)}`} />
                <Tile label="Efect pe an" value={`${dNet >= 0 ? "+" : "−"}${usd(Math.abs(dNet)).replace("−", "")}`} note="net, la ratele de azi" tone={dNet >= 0 ? "good" : "warn"} />
            </div>
            {over && <p className="text-xs text-amber-300">Depășești plafonul tău de LTV ({pct(capLtv, 0)}).</p>}
        </Section>
    );
}

/** 7. LTV if the collateral price moves. */
function Scenarios({ p, capLtv }: { p: LendPositionFull; capLtv: number }) {
    const lt = p.liqThreshold ?? 0.85;
    const moves = [0.1, 0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7];
    return (
        <Section title="Scenarii de preț" hint={`Ce devine LTV-ul dacă ${p.collateral.symbol} se mișcă, cu datoria neschimbată.`}>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                            <th className="py-1 pr-4 font-medium">Mișcare</th>
                            <th className="py-1 pr-4 font-medium">Preț {p.collateral.symbol}</th>
                            <th className="py-1 pr-4 font-medium">Colateral</th>
                            <th className="py-1 pr-4 font-medium">Net</th>
                            <th className="py-1 pr-4 font-medium">LTV</th>
                            <th className="py-1 font-medium">Stare</th>
                        </tr>
                    </thead>
                    <tbody>
                        {moves.map((m) => {
                            const price = p.collateral.priceUsd * (1 + m);
                            const colUsd = p.collateral.amount * price;
                            const ltv = colUsd > 0 ? p.debt.usd / colUsd : 1;
                            const state = ltv >= lt ? ["Lichidare", "text-red-300"] : ltv >= capLtv ? ["Peste plafonul tău", "text-amber-300"] : ["În plafon", "text-emerald-300"];
                            return (
                                <tr key={m} className={cn("border-t border-white/[0.06]", m === 0 && "bg-white/[0.03]")}>
                                    <td className="py-1.5 pr-4 font-mono">{m === 0 ? "acum" : `${m > 0 ? "+" : "−"}${Math.abs(m * 100).toFixed(0)}%`}</td>
                                    <td className="py-1.5 pr-4 font-mono">{usd(price)}</td>
                                    <td className="py-1.5 pr-4 font-mono">{usd(colUsd)}</td>
                                    <td className="py-1.5 pr-4 font-mono">{usd(colUsd - p.debt.usd)}</td>
                                    <td className="py-1.5 pr-4 font-mono">{pct(ltv, 1)}</td>
                                    <td className={cn("py-1.5 text-xs", state[1])}>{state[0]}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}
