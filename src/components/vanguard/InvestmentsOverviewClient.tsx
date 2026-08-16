"use client";

import React from "react";
import Link from "next/link";
import { Card, cn } from "@/components/ui/core";
import { Bitcoin, BarChart3, Landmark, ArrowRight, Info } from "lucide-react";

interface AssetFigures {
    invested: number;
    value: number;
    pnl: number;
    pnlPercent: number;
}

interface VanguardTotals extends AssetFigures {
    holdingCount: number;
}

function formatUSD(amount: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}
function formatGBP(amount: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

function PnlBadge({ pnl, pnlPercent, formatter }: { pnl: number; pnlPercent: number; formatter: (n: number) => string }) {
    const positive = pnl >= 0;
    return (
        <span className={cn("text-xs font-medium", positive ? "text-green-400" : "text-red-400")}>
            {positive ? "+" : ""}{formatter(pnl)} ({positive ? "+" : ""}{pnlPercent.toFixed(1)}%)
        </span>
    );
}

export function InvestmentsOverviewClient({
    btc,
    t212,
    btcT212Total,
    vanguard,
}: {
    btc: AssetFigures & { amount: number };
    t212: AssetFigures & { connected: boolean; hasSnapshot: boolean };
    btcT212Total: AssetFigures;
    vanguard: VanguardTotals;
}) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                    <span className="gradient-text">Investments</span> Overview
                </h1>
                <p className="text-muted text-sm">Toate investițiile, într-un singur loc — fără a combina cifre incomparabile.</p>
            </div>

            <Card className="p-4 border-white/10 bg-white/[0.02] flex items-start gap-3">
                <Info className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                <p className="text-xs text-muted leading-relaxed">
                    BTC și Trading 212 sunt afișate în USD (convenția existentă a aplicației) și au un total combinat, pentru că
                    ambele reprezintă active de piață cu preț live. Vanguard e afișat separat, în GBP, actualizat manual — nu are
                    o sursă de preț live conectată, deci nu e adunat în totalul de mai sus.
                </p>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">BTC + Trading 212 (total)</p>
                        <BarChart3 className="w-4 h-4 text-primary" />
                    </div>
                    <p className="font-num text-2xl font-medium text-foreground">{formatUSD(btcT212Total.value)}</p>
                    <p className="text-xs text-muted mt-1">Investit: {formatUSD(btcT212Total.invested)}</p>
                    <div className="mt-2"><PnlBadge pnl={btcT212Total.pnl} pnlPercent={btcT212Total.pnlPercent} formatter={formatUSD} /></div>
                </Card>

                <Card className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Bitcoin</p>
                        <Bitcoin className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="font-num text-2xl font-medium text-foreground">{formatUSD(btc.value)}</p>
                    <p className="text-xs text-muted mt-1">{btc.amount.toFixed(6)} BTC · Investit {formatUSD(btc.invested)}</p>
                    <div className="mt-2"><PnlBadge pnl={btc.pnl} pnlPercent={btc.pnlPercent} formatter={formatUSD} /></div>
                </Card>

                <Card className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Trading 212</p>
                        <BarChart3 className="w-4 h-4 text-accent" />
                    </div>
                    {t212.connected ? (
                        <>
                            <p className="font-num text-2xl font-medium text-foreground">{formatUSD(t212.value)}</p>
                            <p className="text-xs text-muted mt-1">Investit: {formatUSD(t212.invested)}</p>
                            <div className="mt-2"><PnlBadge pnl={t212.pnl} pnlPercent={t212.pnlPercent} formatter={formatUSD} /></div>
                        </>
                    ) : (
                        <p className="text-sm text-faint italic">Cont neconectat</p>
                    )}
                </Card>
            </div>

            <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Vanguard (separat — actualizat manual)</h2>
                    <Link href="/vanguard" className="text-xs text-primary flex items-center gap-1 hover:underline">
                        Gestionează <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>
                <Card className="p-5 sm:p-6">
                    {vanguard.holdingCount === 0 ? (
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-faint italic">Niciun holding Vanguard adăugat încă.</p>
                            <Link href="/vanguard" className="text-xs text-primary flex items-center gap-1 hover:underline shrink-0">
                                Adaugă <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Landmark className="w-4 h-4 text-faint" />
                                <div>
                                    <p className="font-num text-2xl font-medium text-foreground">{formatGBP(vanguard.value)}</p>
                                    <p className="text-xs text-muted mt-1">
                                        {vanguard.holdingCount} holdinguri · Investit {formatGBP(vanguard.invested)}
                                    </p>
                                </div>
                            </div>
                            <PnlBadge pnl={vanguard.pnl} pnlPercent={vanguard.pnlPercent} formatter={formatGBP} />
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
