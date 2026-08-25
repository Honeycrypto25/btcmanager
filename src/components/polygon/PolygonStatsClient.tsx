"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, PiggyBank, RefreshCcw, ListChecks, History } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";

interface TokenSettingsDTO {
    id: string;
    tokenAddress: string;
    tokenSymbol: string;
}

interface LotDTO {
    id: string;
    settingsId: string;
    status: "PENDING_BUYBACK_ORDER" | "OPEN" | "FILLED" | "CANCELLED" | "FAILED";
    tokenSold: string;
    sellPriceUsd: string;
    usdcReceived: string;
    usdcToBuyback: string;
    usdcProfit: string;
    targetPriceUsd: string | null;
    tokenReacquired: string | null;
    usdcSpent: string | null;
    soldAt: string;
    filledAt: string | null;
    notes: string | null;
}

interface SweepDTO {
    id: string;
    status: string;
    amountUsdc: string;
    destination: string;
    txHash: string | null;
    manual: boolean;
    createdAt: string;
}

interface StatsDTO {
    totalSoldUsd: number;
    totalReinvestedUsd: number;
    totalRealizedProfitUsd: number;
    totalReacquiredCount: number;
    openBuybackOrders: number;
    totalLots: number;
}

interface Props {
    tokenSettings: TokenSettingsDTO[];
    lots: LotDTO[];
    sweeps: SweepDTO[];
    stats: StatsDTO;
}

function fmtUsd(n: number): string {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtToken(n: number): string {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const STATUS_LABELS: Record<LotDTO["status"], string> = {
    PENDING_BUYBACK_ORDER: "Ordin în curs",
    OPEN: "Ordin activ",
    FILLED: "Răscumpărat",
    CANCELLED: "Anulat",
    FAILED: "Eșuat",
};

const STATUS_COLORS: Record<LotDTO["status"], string> = {
    PENDING_BUYBACK_ORDER: "text-orange-400 border-orange-500/20 bg-orange-500/5",
    OPEN: "text-primary border-primary/20 bg-primary/5",
    FILLED: "text-accent border-accent/20 bg-accent/5",
    CANCELLED: "text-faint border-border",
    FAILED: "text-red-300 border-red-400/20 bg-red-500/5",
};

function StatCard({ label, value, icon: Icon, valueColor }: { label: string; value: string; icon: React.ElementType; valueColor?: string }) {
    return (
        <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-faint text-xs uppercase tracking-wider">
                <Icon className="w-3.5 h-3.5" /> {label}
            </div>
            <p className={cn("text-2xl font-num font-medium text-foreground", valueColor)}>{value}</p>
        </Card>
    );
}

export function PolygonStatsClient({ tokenSettings, lots, sweeps, stats }: Props) {
    const [tokenFilter, setTokenFilter] = useState<string | "all">("all");

    const symbolBySettingsId = useMemo(() => {
        const map = new Map<string, string>();
        for (const s of tokenSettings) map.set(s.id, s.tokenSymbol);
        return map;
    }, [tokenSettings]);

    const filteredLots = useMemo(
        () => (tokenFilter === "all" ? lots : lots.filter((l) => l.settingsId === tokenFilter)),
        [lots, tokenFilter]
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/polygon">
                    <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
                </Link>
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Statistici Polygon Reverse-DCA</h1>
                    <p className="text-muted text-sm">Vânzări, ordine de răscumpărare și retrageri, pe toate token-urile.</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard label="Total vândut" value={fmtUsd(stats.totalSoldUsd)} icon={TrendingUp} />
                <StatCard label="Reinvestit în ordine" value={fmtUsd(stats.totalReinvestedUsd)} icon={RefreshCcw} />
                <StatCard label="Profit realizat" value={fmtUsd(stats.totalRealizedProfitUsd)} icon={PiggyBank} valueColor="text-accent" />
                <StatCard label="Ordine active" value={String(stats.openBuybackOrders)} icon={ListChecks} />
                <StatCard label="Răscumpărări finalizate" value={String(stats.totalReacquiredCount)} icon={RefreshCcw} />
                <StatCard label="Total loturi" value={String(stats.totalLots)} icon={History} />
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setTokenFilter("all")}
                    className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        tokenFilter === "all" ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted hover:text-foreground"
                    )}
                >
                    Toate
                </button>
                {tokenSettings.map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setTokenFilter(s.id)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                            tokenFilter === s.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted hover:text-foreground"
                        )}
                    >
                        {s.tokenSymbol}
                    </button>
                ))}
            </div>

            <Card className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Loturi (vânzare → răscumpărare)</h3>
                {filteredLots.length === 0 ? (
                    <p className="text-sm text-muted">Niciun lot încă.</p>
                ) : (
                    <div className="overflow-x-auto -mx-6">
                        <table className="w-full text-sm min-w-[900px]">
                            <thead>
                                <tr className="text-left text-xs text-faint uppercase border-b border-border">
                                    <th className="px-6 py-2 font-medium">Token</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Vândut</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Preț vânzare</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Încasat</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Profit realizat</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Preț țintă răscump.</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Răscumpărat</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLots.map((lot) => (
                                    <tr key={lot.id} className="border-b border-border/50 last:border-0 align-top">
                                        <td className="px-6 py-2.5 whitespace-nowrap text-foreground font-medium">
                                            {symbolBySettingsId.get(lot.settingsId) ?? "?"}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", STATUS_COLORS[lot.status])}>
                                                {STATUS_LABELS[lot.status]}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">{fmtToken(Number(lot.tokenSold))}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">{fmtUsd(Number(lot.sellPriceUsd))}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap font-num text-foreground">{fmtUsd(Number(lot.usdcReceived))}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap font-num text-accent">{fmtUsd(Number(lot.usdcProfit))}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">
                                            {lot.targetPriceUsd ? fmtUsd(Number(lot.targetPriceUsd)) : "—"}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">
                                            {lot.tokenReacquired ? fmtToken(Number(lot.tokenReacquired)) : "—"}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">
                                            {new Date(lot.soldAt).toLocaleDateString("ro-RO")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Card className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Retrageri (sweep USDC)</h3>
                {sweeps.length === 0 ? (
                    <p className="text-sm text-muted">Nicio retragere încă.</p>
                ) : (
                    <div className="overflow-x-auto -mx-6">
                        <table className="w-full text-sm min-w-[600px]">
                            <thead>
                                <tr className="text-left text-xs text-faint uppercase border-b border-border">
                                    <th className="px-6 py-2 font-medium">Data</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Sumă</th>
                                    <th className="px-3 py-2 font-medium">Tip</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sweeps.map((s) => (
                                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                                        <td className="px-6 py-2.5 whitespace-nowrap text-xs text-faint">{new Date(s.createdAt).toLocaleString("ro-RO")}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <span className={cn("text-xs font-medium", s.status === "SUCCESS" ? "text-accent" : "text-red-300")}>
                                                {s.status === "SUCCESS" ? "Reușit" : "Eșuat"}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap font-num text-foreground">{fmtUsd(Number(s.amountUsdc))}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted">{s.manual ? "manual" : "automat"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
