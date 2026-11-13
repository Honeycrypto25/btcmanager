"use client";

import React, { useState, useTransition } from "react";
import { format } from "date-fns";
import { Target, X, Repeat } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import { createSolanaLimitBuyNow, cancelSolanaLimitBuyNow, saveSolanaAutoDip } from "@/app/actions/solana";
import { formatUsd, type SettingsDTO } from "./shared";

/** Serialized SolanaBuyOrder (Prisma Decimals arrive as strings after JSON). */
export interface SolanaLimitBuyDTO {
    id: string;
    status: "OPEN" | "FILLED" | "CANCELLED";
    amountUsd: string | number;
    limitPriceUsd: string | number;
    solPlanned: string | number;
    auto: boolean;
    anchorPriceUsd: string | number | null;
    createdAt: string;
    filledAt: string | null;
    cancelledAt: string | null;
    lotId: string | null;
    notes: string | null;
}

const STATUS_LABEL: Record<SolanaLimitBuyDTO["status"], { text: string; cls: string }> = {
    OPEN: { text: "Activ", cls: "text-amber-400" },
    FILLED: { text: "Executat", cls: "text-accent" },
    CANCELLED: { text: "Anulat", cls: "text-faint" },
};

const QUICK_DROPS = [3, 5, 10];

const inputCls = "w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground";

export function SolanaLimitBuyCard({
    orders,
    settings,
    solPriceUsd,
    lastBuyPriceUsd,
}: {
    orders: SolanaLimitBuyDTO[];
    settings: SettingsDTO;
    solPriceUsd: number | null;
    lastBuyPriceUsd: number | null;
}) {
    const [amount, setAmount] = useState(String(Number(settings.buyAmountUsd) || 20));
    const [price, setPrice] = useState("");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    // Auto "dip" order
    const [autoOn, setAutoOn] = useState(settings.autoDipEnabled ?? false);
    const [autoPct, setAutoPct] = useState(String(Number(settings.autoDipPercent ?? 10)));
    const [autoAmount, setAutoAmount] = useState(String(Number(settings.autoDipAmountUsd ?? 20)));
    const [autoMove, setAutoMove] = useState(String(Number(settings.autoDipMinMovePercent ?? 2)));
    const [autoNote, setAutoNote] = useState<string | null>(settings.autoDipLastNote ?? null);

    const amountNum = Number(amount);
    const priceNum = Number(price);
    const validPreview = amountNum > 0 && priceNum > 0;
    const solPreview = validPreview ? amountNum / priceNum : 0;
    const dropPct = solPriceUsd && priceNum > 0 ? (priceNum / solPriceUsd - 1) * 100 : null;
    const openLocked = orders.filter((o) => o.status === "OPEN").reduce((s, o) => s + Number(o.amountUsd), 0);

    const autoPctNum = Number(autoPct);
    const autoTarget = lastBuyPriceUsd && autoPctNum > 0 ? lastBuyPriceUsd * (1 - autoPctNum / 100) : null;

    function submit() {
        setError(null);
        setMessage(null);
        if (!window.confirm(`Pui un ordin limit: cumperi ${formatUsd(amountNum)} de SOL când prețul ajunge la ${formatUsd(priceNum)}. Suma e blocată la Jupiter până se execută sau îl anulezi. Continui?`)) return;
        startTransition(async () => {
            try {
                await createSolanaLimitBuyNow({ amountUsd: amountNum, limitPriceUsd: priceNum });
                setMessage("Ordin plasat.");
                window.location.reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la plasarea ordinului.");
            }
        });
    }

    function cancel(id: string) {
        if (!window.confirm("Anulezi ordinul? Se face o tranzacție on-chain (taxă mică) și USDC-ul revine în portofel.")) return;
        setError(null);
        startTransition(async () => {
            try {
                await cancelSolanaLimitBuyNow(id);
                window.location.reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la anulare.");
            }
        });
    }

    function saveAuto(nextOn: boolean) {
        setError(null);
        const msg = nextOn
            ? `Pornești ordinul automat: ${formatUsd(Number(autoAmount))} la ${autoPct}% sub ultimul preț de achiziție. Se plasează acum un ordin real, cu USDC blocat la Jupiter. Continui?`
            : "Oprești ordinul automat? Ordinul activ se anulează (taxă mică) și USDC-ul revine în portofel.";
        if (!window.confirm(msg)) return;
        startTransition(async () => {
            try {
                const r = await saveSolanaAutoDip({ enabled: nextOn, percent: autoPctNum, amountUsd: Number(autoAmount), minMovePercent: Number(autoMove) });
                setAutoOn(nextOn);
                setAutoNote(r.note);
                window.location.reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la salvare.");
            }
        });
    }

    return (
        <Card className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                    <Target className="h-4 w-4" />
                </div>
                <div>
                    <h2 className="text-sm font-medium text-foreground">Ordin limit de cumpărare</h2>
                    <p className="text-xs text-faint">
                        Cumperi SOL când prețul scade la nivelul ales. USDC-ul e blocat la Jupiter cât timp ordinul e activ și revine la anulare.
                        {openLocked > 0 ? ` Blocat acum: ${formatUsd(openLocked)}.` : ""}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                    <span className="text-xs text-faint">Sumă ($ USDC, min 5)</span>
                    <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-faint">Preț limită ($ per SOL)</span>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder={solPriceUsd ? `sub ${solPriceUsd.toFixed(2)}` : ""}
                        className={inputCls}
                    />
                </label>
            </div>

            {solPriceUsd && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                    <span>Preț curent {formatUsd(solPriceUsd)} · sub preț cu:</span>
                    {QUICK_DROPS.map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setPrice((solPriceUsd * (1 - d / 100)).toFixed(2))}
                            className="rounded-md border border-border px-2 py-1 text-muted transition-colors hover:text-foreground"
                        >
                            −{d}%
                        </button>
                    ))}
                </div>
            )}

            {validPreview && (
                <p className="text-xs text-muted">
                    Primești ≈ <span className="font-num text-foreground">{solPreview.toFixed(4)} SOL</span> la {formatUsd(priceNum)}
                    {dropPct !== null ? ` (${dropPct.toFixed(1)}% față de acum)` : ""}. După execuție, botul pune ordinul de vânzare la +{Number(settings.takeProfitPercent)}%, la următoarea verificare
                    (zilnic la 09:00 UTC sau „Verifică ordinele”).
                </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <Button onClick={submit} disabled={pending || !validPreview} variant="primary" size="sm">
                    <Target className="h-4 w-4" /> {pending ? "Se procesează..." : "Plasează ordinul"}
                </Button>
                {message && <span className="text-sm text-muted">{message}</span>}
                {error && <span className="text-sm text-red-300">{error}</span>}
            </div>

            {/* Auto dip order */}
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-medium text-foreground">Ordin automat sub ultimul preț de achiziție</h3>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", autoOn ? "border-emerald-400/30 text-emerald-300" : "border-white/10 text-faint")}>{autoOn ? "Pornit" : "Oprit"}</span>
                    </div>
                </div>
                <p className="text-xs text-faint">
                    Botul ține un singur ordin limit de cumpărare la X% sub prețul ultimei cumpărări, ca să prindă spike-urile în jos chiar dacă verifică o singură dată pe zi. Când apare o cumpărare nouă, ordinul se mută sub noul preț.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="space-y-1">
                        <span className="text-xs text-faint">% sub ultimul preț</span>
                        <input type="number" min="0.1" max="89" step="any" value={autoPct} onChange={(e) => setAutoPct(e.target.value)} className={inputCls} />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-faint">Sumă per ordin ($ USDC, min 5)</span>
                        <input type="number" min="0" step="any" value={autoAmount} onChange={(e) => setAutoAmount(e.target.value)} className={inputCls} />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-faint">Mută ordinul doar dacă referința se mișcă cu (%)</span>
                        <input type="number" min="0" max="49" step="any" value={autoMove} onChange={(e) => setAutoMove(e.target.value)} className={inputCls} />
                    </label>
                </div>
                {lastBuyPriceUsd && autoTarget && (
                    <p className="text-xs text-muted">
                        Ultimul preț de achiziție: <span className="font-num text-foreground">{formatUsd(lastBuyPriceUsd)}</span> → ordin la{" "}
                        <span className="font-num text-foreground">{formatUsd(autoTarget)}</span>
                        {solPriceUsd ? ` (${((autoTarget / solPriceUsd - 1) * 100).toFixed(1)}% față de prețul curent)` : ""}.
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => saveAuto(true)} disabled={pending} variant="primary" size="sm">
                        {autoOn ? "Salvează și repoziționează" : "Pornește"}
                    </Button>
                    {autoOn && (
                        <Button onClick={() => saveAuto(false)} disabled={pending} variant="outline" size="sm">
                            Oprește
                        </Button>
                    )}
                </div>
                {autoNote && <p className="text-xs text-muted">{autoNote}</p>}
            </div>

            {orders.length > 0 && (
                <div className="border-t border-white/[0.06] pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Ordinele tale</p>
                    <div className="space-y-2">
                        {orders.map((o) => {
                            const st = STATUS_LABEL[o.status];
                            return (
                                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                                    <div className="space-y-0.5">
                                        <p className="text-sm text-foreground">
                                            <span className="font-num">{formatUsd(Number(o.amountUsd))}</span> la <span className="font-num">{formatUsd(Number(o.limitPriceUsd))}</span>{" "}
                                            <span className="text-xs text-faint">(≈ {Number(o.solPlanned).toFixed(4)} SOL){o.auto ? " · automat" : ""}</span>
                                        </p>
                                        <p className="text-[11px] text-faint">
                                            <span className={cn("font-medium", st.cls)}>{st.text}</span>
                                            {" · "}creat {format(new Date(o.createdAt), "d MMM, HH:mm")}
                                            {o.filledAt ? ` · executat ${format(new Date(o.filledAt), "d MMM, HH:mm")}` : ""}
                                            {o.notes ? ` · ${o.notes}` : ""}
                                        </p>
                                    </div>
                                    {o.status === "OPEN" && (
                                        <Button onClick={() => cancel(o.id)} disabled={pending} variant="outline" size="sm">
                                            <X className="h-3.5 w-3.5" /> Anulează
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Card>
    );
}
