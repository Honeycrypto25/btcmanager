"use client";

import React, { useState, useTransition } from "react";
import { format } from "date-fns";
import { Target, X } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import { createEvmLimitBuyNow, cancelEvmLimitBuyNow } from "@/app/actions/evm";
import { formatUsd } from "./shared";

/** Serialized EvmBuyOrder (Prisma Decimals arrive as strings after JSON). */
export interface LimitBuyDTO {
    id: string;
    status: "OPEN" | "FILLED" | "CANCELLED";
    amountUsd: string | number;
    limitPriceUsd: string | number;
    wethPlanned: string | number;
    expiresAt: string;
    createdAt: string;
    filledAt: string | null;
    cancelledAt: string | null;
    notes: string | null;
}

const STATUS_LABEL: Record<LimitBuyDTO["status"], { text: string; cls: string }> = {
    OPEN: { text: "Activ", cls: "text-amber-400" },
    FILLED: { text: "Executat", cls: "text-accent" },
    CANCELLED: { text: "Anulat / expirat", cls: "text-faint" },
};

const QUICK_DROPS = [3, 5, 10];

export function EvmLimitBuyCard({
    orders,
    wethPriceUsd,
    takeProfitPercent,
    defaultAmountUsd,
}: {
    orders: LimitBuyDTO[];
    wethPriceUsd: number | null;
    takeProfitPercent: number;
    defaultAmountUsd: number;
}) {
    const [amount, setAmount] = useState(String(defaultAmountUsd));
    const [price, setPrice] = useState("");
    const [days, setDays] = useState("30");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const amountNum = Number(amount);
    const priceNum = Number(price);
    const validPreview = amountNum > 0 && priceNum > 0;
    const wethPreview = validPreview ? amountNum / priceNum : 0;
    const dropPct = wethPriceUsd && priceNum > 0 ? (priceNum / wethPriceUsd - 1) * 100 : null;
    const openReserved = orders.filter((o) => o.status === "OPEN").reduce((s, o) => s + Number(o.amountUsd), 0);

    function submit() {
        setError(null);
        setMessage(null);
        if (!window.confirm(`Pui un ordin limit: cumperi ${formatUsd(amountNum)} de WETH când prețul ajunge la ${formatUsd(priceNum)}. Suma se rezervă în portofel până se execută sau îl anulezi. Continui?`)) return;
        startTransition(async () => {
            try {
                await createEvmLimitBuyNow({ amountUsd: amountNum, limitPriceUsd: priceNum, expirationDays: Number(days) || 30 });
                setMessage("Ordin plasat.");
                window.location.reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la plasarea ordinului.");
            }
        });
    }

    function cancel(id: string) {
        if (!window.confirm("Anulezi ordinul? Se face o tranzacție on-chain (gas mic pe Base).")) return;
        setError(null);
        startTransition(async () => {
            try {
                await cancelEvmLimitBuyNow(id);
                window.location.reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la anulare.");
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
                        Cumperi WETH când prețul scade la nivelul ales. USDC-ul rămâne în portofel, dar e rezervat: cumpărările automate nu îl ating.
                        {openReserved > 0 ? ` Rezervat acum: ${formatUsd(openReserved)}.` : ""}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                    <span className="text-xs text-faint">Sumă ($ USDC)</span>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-faint">Preț limită ($ per ETH)</span>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder={wethPriceUsd ? `sub ${wethPriceUsd.toFixed(0)}` : ""}
                        className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-faint">Expiră în (zile, max 90)</span>
                    <input
                        type="number"
                        min="1"
                        max="90"
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                        className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground"
                    />
                </label>
            </div>

            {wethPriceUsd && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                    <span>Preț curent {formatUsd(wethPriceUsd)} · sub preț cu:</span>
                    {QUICK_DROPS.map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setPrice((wethPriceUsd * (1 - d / 100)).toFixed(2))}
                            className="rounded-md border border-border px-2 py-1 text-muted transition-colors hover:text-foreground"
                        >
                            −{d}%
                        </button>
                    ))}
                </div>
            )}

            {validPreview && (
                <p className="text-xs text-muted">
                    Primești ≈ <span className="font-num text-foreground">{wethPreview.toFixed(6)} WETH</span> la {formatUsd(priceNum)}
                    {dropPct !== null ? ` (${dropPct.toFixed(1)}% față de acum)` : ""}. După execuție, botul pune ordinul de vânzare la +{takeProfitPercent}%, la următoarea verificare
                    (zilnic la 09:10 UTC sau „Verifică ordinele”).
                </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <Button onClick={submit} disabled={pending || !validPreview} variant="primary" size="sm">
                    <Target className="h-4 w-4" /> {pending ? "Se procesează..." : "Plasează ordinul"}
                </Button>
                {message && <span className="text-sm text-muted">{message}</span>}
                {error && <span className="text-sm text-red-300">{error}</span>}
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
                                            <span className="font-num">{formatUsd(Number(o.amountUsd))}</span> la{" "}
                                            <span className="font-num">{formatUsd(Number(o.limitPriceUsd))}</span>{" "}
                                            <span className="text-xs text-faint">(≈ {Number(o.wethPlanned).toFixed(6)} WETH)</span>
                                        </p>
                                        <p className="text-[11px] text-faint">
                                            <span className={cn("font-medium", st.cls)}>{st.text}</span>
                                            {" · "}creat {format(new Date(o.createdAt), "d MMM, HH:mm")}
                                            {o.status === "OPEN" ? ` · expiră ${format(new Date(o.expiresAt), "d MMM yyyy")}` : ""}
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
