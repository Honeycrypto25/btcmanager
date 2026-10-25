"use client";

import React, { useEffect, useState } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { Loader2 } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import { getVanguardPurchaseStats, type VanguardAccountPurchaseStats } from "@/app/actions/vanguard";

function formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function Kpi({ label, value, sub, valueClass }: { label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string }) {
    return (
        <Card className="p-4 sm:p-5">
            <p className="text-[10px] text-muted uppercase font-medium tracking-wider mb-2">{label}</p>
            <p className={cn("font-num text-xl sm:text-2xl font-medium text-foreground truncate", valueClass)}>{value}</p>
            {sub && <p className="text-xs text-muted mt-1 truncate">{sub}</p>}
        </Card>
    );
}

/**
 * BTC-ROI-style KPI cards (invested, value, units, ROI, purchases, average
 * buy price, largest purchase, investing since) for Vanguard / Fidelity.
 * Self-contained: fetches its own stats, optionally narrowed to one account.
 *
 * Units and average buy price are only shown when every holding in scope
 * is the same fund -- summing units of different funds means nothing.
 */
export function InvestmentKpis({
    provider,
    accountId = "all",
    refreshKey,
}: {
    provider: "vanguard" | "fidelity";
    accountId?: string;
    refreshKey?: number;
}) {
    const [stats, setStats] = useState<VanguardAccountPurchaseStats[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        getVanguardPurchaseStats(provider)
            .then((s) => { if (!cancelled) setStats(s); })
            .catch(() => { if (!cancelled) setStats([]); });
        return () => { cancelled = true; };
    }, [provider, refreshKey]);

    if (stats === null) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă statisticile...
            </div>
        );
    }

    const scope = accountId === "all" ? stats : stats.filter((s) => s.accountId === accountId);
    if (scope.length === 0) return null;

    const currency = scope[0].currency;
    const invested = scope.reduce((s, a) => s + a.invested, 0);
    const value = scope.reduce((s, a) => s + a.value, 0);
    const units = scope.reduce((s, a) => s + a.units, 0);
    const pnl = value - invested;
    const roi = invested > 0 ? (pnl / invested) * 100 : 0;
    const purchaseCount = scope.reduce((s, a) => s + a.purchaseCount, 0);
    const undated = scope.reduce((s, a) => s + a.undatedAmount, 0);
    const tickers = new Set(scope.flatMap((a) => a.tickers));
    const singleFund = tickers.size <= 1 && units > 0;

    let largest: { amount: number; date: string; accountName: string } | null = null;
    for (const a of scope) {
        if (a.largestPurchase && (!largest || a.largestPurchase.amount > largest.amount)) {
            largest = { ...a.largestPurchase, accountName: a.accountName };
        }
    }
    const firstDate = scope
        .map((a) => a.firstDate)
        .filter((d): d is string => !!d)
        .sort()[0];
    const daysInvesting = firstDate ? differenceInCalendarDays(new Date(), new Date(firstDate)) : null;

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Kpi label="Total investit" value={formatMoney(invested, currency)} />
                <Kpi label="Valoare curentă" value={formatMoney(value, currency)} />
                <Kpi
                    label="Total unități"
                    value={singleFund ? units.toLocaleString("ro-RO", { maximumFractionDigits: 4 }) : "—"}
                    sub={singleFund ? undefined : "fonduri diferite"}
                />
                <Kpi
                    label="ROI total"
                    value={`${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%`}
                    valueClass={roi >= 0 ? "text-green-400" : "text-red-400"}
                    sub={`${pnl >= 0 ? "+" : ""}${formatMoney(pnl, currency)}`}
                />
                <Kpi
                    label="Cumpărări"
                    value={purchaseCount}
                    sub={undated > 0.01 ? `+ ${formatMoney(undated, currency)} fără dată` : undefined}
                />
                <Kpi
                    label="Preț mediu cumpărare"
                    value={singleFund ? formatMoney(invested / units, currency) : "—"}
                    sub={singleFund ? "per unitate, ponderat" : "fonduri diferite"}
                />
                <Kpi
                    label="Cea mai mare cumpărare"
                    value={largest ? formatMoney(largest.amount, currency) : "—"}
                    sub={largest ? `${format(new Date(largest.date), "dd MMM yyyy")}${accountId === "all" && scope.length > 1 ? ` · ${largest.accountName}` : ""}` : "nicio cumpărare datată"}
                />
                <Kpi
                    label="Investești de"
                    value={daysInvesting !== null ? `${daysInvesting}z` : "—"}
                    sub={firstDate ? `din ${format(new Date(firstDate), "dd MMM yyyy")}` : undefined}
                />
            </div>
            {undated > 0.01 && (
                <p className="text-[11px] text-faint italic">
                    {formatMoney(undated, currency)} din totalul investit nu au o dată de cumpărare (importate doar ca total) — nu intră în numărul
                    de cumpărări și în „cea mai mare cumpărare”. Importă istoricul de tranzacții ca să apară și ele.
                </p>
            )}
        </div>
    );
}
