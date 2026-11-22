"use client";

import React, { useMemo, useState } from "react";
import { Card, cn } from "@/components/ui/core";
import { adviseAmount, type CashLot, type Verdict } from "@/lib/amount-advice";

const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TARGETS = [7, 14, 30, 60] as const;

const META: Record<Verdict, { title: string; box: string; dot: string }> = {
    increase: { title: "Poți mări suma pe ciclu", box: "border-emerald-500/30 bg-emerald-500/[0.07]", dot: "bg-emerald-400" },
    keep: { title: "Menține suma", box: "border-amber-400/30 bg-amber-400/[0.07]", dot: "bg-amber-300" },
    "keep-thin": { title: "Menține suma — marjă subțire", box: "border-amber-400/30 bg-amber-400/[0.07]", dot: "bg-amber-300" },
    topup: { title: "Alimentează portofelul", box: "border-red-500/30 bg-red-500/[0.07]", dot: "bg-red-400" },
};

/**
 * Advises whether the per-cycle buy amount can go up, based on real cash flow (spend vs. sale proceeds that return
 * to the same wallet), the wallet balance and a runway target. Read-only: nothing is written anywhere.
 */
export function AmountAdviceCard({
    lots, balance, buyAmount, periodHours, strikePct, noFuel30, unit = "USDC", balanceLabel = "Sold portofel", words, description, note,
}: {
    lots: CashLot[]; balance: number; buyAmount: number; periodHours: number; strikePct: number | null; noFuel30: number; unit?: string;
    balanceLabel?: string; words?: { out: string; back: string; stock: string; topup: string }; description?: string; note?: string;
}) {
    const [target, setTarget] = useState<number>(14);
    const a = useMemo(
        () => adviseAmount({ lots, balance, buyAmount, periodHours, targetDays: target, strikePct, noFuel30, words }),
        [lots, balance, buyAmount, periodHours, target, strikePct, noFuel30, words],
    );
    const m = META[a.verdict];
    return (
        <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-medium text-foreground">Recomandare sumă pe ciclu</h2>
                    <p className="text-xs text-muted">{description ?? `Ține cont de vânzările care readuc ${unit} în același portofel (consum net) și de ritmul recent, nu de media pe 3 luni.`}</p>
                </div>
                <div className="flex items-center gap-1 text-xs">
                    <span className="mr-1 text-faint">Autonomie țintă</span>
                    {TARGETS.map((d) => (
                        <button key={d} onClick={() => setTarget(d)} className={cn("rounded-md border px-2 py-1", d === target ? "border-white/30 bg-white/10 text-foreground" : "border-white/10 text-muted hover:text-foreground")}>
                            {d}z
                        </button>
                    ))}
                </div>
            </div>

            <div className={cn("mb-4 rounded-xl border p-4", m.box)}>
                <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", m.dot)} />
                    <span className="text-base font-semibold text-foreground">{m.title}</span>
                </div>
                {a.suggestedAmount != null && (
                    <p className="mt-1 text-sm text-foreground">De la {usd(buyAmount)} la <span className="font-semibold">{usd(a.suggestedAmount)}</span> pe ciclu ({a.suggestedAmount > buyAmount ? "+" : ""}{Math.round((a.suggestedAmount / buyAmount - 1) * 100)}%).</p>
                )}
                {a.verdict === "topup" && <p className="mt-1 text-sm text-foreground">Adaugă ~<span className="font-semibold">{usd(a.topUpUsd)}</span> {unit} ca să ai {target} zile de autonomie.</p>}
                <ul className="mt-2 space-y-1 text-xs text-muted">
                    {a.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label={balanceLabel} value={usd(balance)} />
                <Tile label="Autonomie netă" value={a.runwayNetDays == null ? "nu scade" : `${a.runwayNetDays.toFixed(1)} zile`} />
                <Tile label="Autonomie brută" value={`${a.runwayGrossDays.toFixed(1)} zile`} hint="fără reveniri" />
                <Tile label="Recuperare" value={`${Math.round(a.primary.recovery * 100)}%`} hint="reveniri ÷ ieșiri" />
            </div>

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="text-faint">
                        <tr className="text-left"><th className="py-1 pr-3 font-normal">Fereastră</th><th className="pr-3 font-normal">Ieșiri/zi (nr.)</th><th className="pr-3 font-normal">Ieșit/zi</th><th className="pr-3 font-normal">Revenit/zi</th><th className="font-normal">Net/zi</th></tr>
                    </thead>
                    <tbody className="text-foreground">
                        {a.windows.map((w) => (
                            <tr key={w.label} className="border-t border-white/5">
                                <td className="py-1 pr-3">{w.label}{w.label.startsWith(String(a.primaryDays)) ? " ●" : ""}</td>
                                <td className="pr-3">{w.flow.buysPerDay.toFixed(2)}</td>
                                <td className="pr-3">{usd(w.flow.spendPerDay)}</td>
                                <td className="pr-3">{usd(w.flow.proceedsPerDay)}</td>
                                <td>{usd(w.flow.netPerDay)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-3 text-[11px] text-faint">● = fereastra folosită la decizie. Heuristică de administrare a fondurilor, nu prognoză de preț și nu sfat financiar.{note ? ` ${note}` : ""}</p>
        </Card>
    );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[11px] text-faint">{label}</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
            {hint && <div className="text-[10px] text-faint">{hint}</div>}
        </div>
    );
}
