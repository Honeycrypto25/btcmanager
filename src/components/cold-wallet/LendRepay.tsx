"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, HandCoins } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import { repayLendLoan, refreshLoanPages, type RepayResult } from "@/app/actions/lend-repay";

export interface RepayPosition {
    vaultId: number;
    id: number;
    label: string;
    debtAmount: number;
    debtSymbol: string;
}

const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Pay the loan down with the bot wallet's USDC. Amount chosen by the person, always simulated first, and a second
 * click confirms the real payment. The bot can only repay — the position stays owned by the cold wallet.
 */
export function LendRepay({ positions, usdcBalance, buyAmountUsd }: { positions: RepayPosition[]; usdcBalance: number | null; buyAmountUsd: number | null }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [posKey, setPosKey] = useState(positions[0] ? `${positions[0].vaultId}:${positions[0].id}` : "");
    const [amount, setAmount] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [result, setResult] = useState<RepayResult | null>(null);
    const [paid, setPaid] = useState(false);

    const pos = positions.find((p) => `${p.vaultId}:${p.id}` === posKey) ?? positions[0];
    if (!pos) return null;
    const value = Number(amount.replace(",", "."));
    const valid = Number.isFinite(value) && value > 0;
    const maxPay = usdcBalance == null ? 0 : Math.floor(Math.min(usdcBalance, pos.debtAmount) * 100) / 100;
    const tooMuchForBot = valid && usdcBalance != null && value > usdcBalance + 1e-6;
    const tooMuchForDebt = valid && value > pos.debtAmount + 1e-6;
    const leftover = valid && usdcBalance != null ? usdcBalance - value : null;
    const botStarved = leftover != null && buyAmountUsd != null && buyAmountUsd > 0 && leftover < buyAmountUsd;

    const run = (dryRun: boolean) => {
        setResult(null);
        setPaid(false);
        start(async () => {
            const r = await repayLendLoan({ vaultId: pos.vaultId, positionId: pos.id, amountUsdc: value, dryRun });
            setResult(r);
            setConfirming(false);
            // After a real payment nothing refreshes by itself: the message stays put until "Actualizează datele" is pressed.
            setPaid(r.ok && !dryRun);
        });
    };

    return (
        <Card className="space-y-4">
            <div>
                <h2 className="font-display text-base font-medium text-foreground">Plătește din împrumut</h2>
                <p className="text-xs text-muted">
                    Folosește USDC din portofelul botului ca să reduci datoria. Botul poate doar plăti — nu poate retrage sau împrumuta. Plata se simulează mai întâi.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[11px] uppercase tracking-wider text-faint">Datorie acum</p>
                    <p className="font-mono text-sm text-foreground">
                        {money(pos.debtAmount)} {pos.debtSymbol}
                    </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[11px] uppercase tracking-wider text-faint">USDC în portofelul botului</p>
                    <p className="font-mono text-sm text-foreground">{usdcBalance == null ? "—" : `${money(usdcBalance)} USDC`}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[11px] uppercase tracking-wider text-faint">Rămas după plată</p>
                    <p className="font-mono text-sm text-foreground">{leftover == null ? "—" : `${money(Math.max(0, leftover))} USDC`}</p>
                </div>
            </div>

            {positions.length > 1 && (
                <select
                    value={posKey}
                    onChange={(e) => {
                        setPosKey(e.target.value);
                        setResult(null);
                        setConfirming(false);
                    }}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                >
                    {positions.map((p) => (
                        <option key={`${p.vaultId}:${p.id}`} value={`${p.vaultId}:${p.id}`}>
                            {p.label} · datorie {money(p.debtAmount)} {p.debtSymbol}
                        </option>
                    ))}
                </select>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <input
                    inputMode="decimal"
                    placeholder="Sumă USDC"
                    value={amount}
                    onChange={(e) => {
                        setAmount(e.target.value);
                        setResult(null);
                        setConfirming(false);
                    }}
                    className="w-40 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
                <button
                    type="button"
                    disabled={maxPay <= 0}
                    onClick={() => {
                        setAmount(String(maxPay));
                        setResult(null);
                        setConfirming(false);
                    }}
                    className="min-h-[36px] rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-muted hover:border-white/20 disabled:opacity-40"
                >
                    Tot USDC-ul disponibil ({money(maxPay)})
                </button>
                <button
                    type="button"
                    disabled={pending || !valid || tooMuchForBot || tooMuchForDebt}
                    onClick={() => run(true)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground hover:border-white/20 disabled:opacity-40"
                >
                    <FlaskConical className="h-4 w-4" /> Simulează plata
                </button>
                {!confirming ? (
                    <button
                        type="button"
                        disabled={pending || !valid || tooMuchForBot || tooMuchForDebt}
                        onClick={() => setConfirming(true)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 text-sm text-amber-200 hover:bg-amber-400/20 disabled:opacity-40"
                    >
                        <HandCoins className="h-4 w-4" /> Plătește
                    </button>
                ) : (
                    <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-100">
                        Plătești {money(value)} USDC în împrumutul #{pos.id}?
                        <button type="button" disabled={pending} onClick={() => run(false)} className="rounded-md bg-amber-400/80 px-2.5 py-1 text-xs font-medium text-black hover:bg-amber-300 disabled:opacity-50">
                            Da, plătește
                        </button>
                        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-foreground hover:border-white/30">
                            Anulează
                        </button>
                    </span>
                )}
                {pending && <span className="text-xs text-muted">Se procesează…</span>}
            </div>

            {tooMuchForBot && <p className="text-xs text-red-300">Botul are doar {money(usdcBalance ?? 0)} USDC.</p>}
            {tooMuchForDebt && <p className="text-xs text-red-300">Suma depășește datoria ({money(pos.debtAmount)} USDC).</p>}
            {botStarved && !tooMuchForBot && (
                <p className="text-xs text-amber-200">
                    Atenție: botul cumpără cu ${money(buyAmountUsd ?? 0)} per ciclu, iar după plată rămân ${money(Math.max(0, leftover ?? 0))} USDC — nu ajung pentru următoarea cumpărare.
                </p>
            )}

            {result && (
                <div className={cn("rounded-lg border px-3 py-2 text-sm", result.ok ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-red-400/30 bg-red-500/10 text-red-200")}>
                    <p>{result.message}</p>
                    {paid && (
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                                start(async () => {
                                    await refreshLoanPages();
                                    setAmount("");
                                    setPaid(false);
                                    router.refresh();
                                })
                            }
                            className="mb-1 mt-2 inline-flex min-h-[32px] items-center rounded-md border border-emerald-400/40 px-3 text-xs text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-50"
                        >
                            Actualizează datele
                        </button>
                    )}
                    {result.signature && (
                        <a href={`https://solscan.io/tx/${result.signature}`} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                            Vezi tranzacția pe Solscan
                        </a>
                    )}
                    {result.simulation && !result.ok && result.simulation.logs.length > 0 && (
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-80">{result.simulation.logs.join("\n")}</pre>
                    )}
                </div>
            )}
        </Card>
    );
}
