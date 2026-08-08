import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, cn } from "@/components/ui/core";
import { TrendingUp, TrendingDown, Bitcoin, BarChart3, ArrowRight } from "lucide-react";
import Link from 'next/link';
import { getCurrentBtcPrice } from "@/lib/btc";
import { db } from "@/lib/db";
import { getExchangeRate } from "@/lib/fx";

interface PeriodTotals {
    btc: number;
    t212: number;
}

export default async function OverviewPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const userId = (session.user as any).id as string;

    // --- BTC data ---
    const currentBtcPrice = await getCurrentBtcPrice();
    const wallets = await db.bitcoinWallet.findMany({ include: { transactions: true } });
    const allBtcTx = wallets.flatMap((w: any) => w.transactions);

    const totalBtc = allBtcTx.reduce((acc: number, t: any) => acc + t.amount, 0);
    const btcCurrentValue = totalBtc * currentBtcPrice;
    const btcInvested = allBtcTx.reduce((acc: number, t: any) => acc + t.amount * t.priceAtTime, 0);

    // --- T212 data ---
    const t212Account = await db.t212Account.findFirst({ where: { userId } });
    let t212CurrentValueUsd = 0;
    let t212InvestedUsd = 0;
    let t212Connected = false;
    let t212Snapshot: any = null;
    let fxRate = 1;

    if (t212Account) {
        t212Connected = true;
        t212Snapshot = await db.t212Snapshot.findFirst({
            where: { accountId: t212Account.id },
            orderBy: { capturedAt: "desc" },
        });

        if (t212Snapshot) {
            fxRate = await getExchangeRate(t212Snapshot.currency, "USD");
            t212CurrentValueUsd = t212Snapshot.totalValue * fxRate;
            t212InvestedUsd = t212Snapshot.investedValue * fxRate;
        }
    }

    // --- Combined totals ---
    const totalInvested = btcInvested + t212InvestedUsd;
    const totalValue = btcCurrentValue + t212CurrentValueUsd;
    const totalPnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    // --- Yearly / monthly invested breakdown ---
    const yearly = new Map<number, PeriodTotals>();
    const monthly = new Map<string, PeriodTotals>(); // "YYYY-MM"

    const addTo = (map: Map<any, PeriodTotals>, key: any, source: 'btc' | 't212', amount: number) => {
        const existing = map.get(key) ?? { btc: 0, t212: 0 };
        existing[source] += amount;
        map.set(key, existing);
    };

    for (const tx of allBtcTx) {
        const d = new Date(tx.timestamp);
        const invested = tx.amount * tx.priceAtTime;
        addTo(yearly, d.getFullYear(), 'btc', invested);
        addTo(monthly, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 'btc', invested);
    }

    if (t212Account) {
        const deposits = await db.t212CashFlow.findMany({
            where: { accountId: t212Account.id, type: "DEPOSIT" },
        });
        for (const dep of deposits) {
            const d = new Date(dep.dateTime);
            const investedUsd = dep.amount * fxRate;
            addTo(yearly, d.getFullYear(), 't212', investedUsd);
            addTo(monthly, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 't212', investedUsd);
        }
    }

    const yearlyRows = Array.from(yearly.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([year, totals]) => ({ label: String(year), ...totals, total: totals.btc + totals.t212 }));

    const currentYear = new Date().getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyRows = Array.from(monthly.entries())
        .filter(([key]) => key.startsWith(String(currentYear)))
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, totals]) => {
            const monthIdx = parseInt(key.split('-')[1], 10) - 1;
            return { label: monthNames[monthIdx], ...totals, total: totals.btc + totals.t212 };
        });

    const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    return (
        <DashboardLayout>
            <div>
                <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                    Overview
                </h1>
                <p className="text-muted text-sm">
                    Combined performance across all your long-term investments.
                </p>
            </div>

            {/* Combined Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total invested</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(totalInvested)}</h2>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Current value</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(totalValue)}</h2>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total P&amp;L</p>
                    <div className="flex items-center gap-2">
                        <h2 className={cn("text-2xl font-medium font-num", totalPnl >= 0 ? "text-accent" : "text-red-400")}>
                            {totalPnl >= 0 ? '+' : ''}{fmt(Math.abs(totalPnl))}
                        </h2>
                        {totalPnl >= 0 ? <TrendingUp className="w-4 h-4 text-accent" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </div>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">ROI</p>
                    <h2 className={cn("text-2xl font-medium font-num", pnlPercent >= 0 ? "text-accent" : "text-red-400")}>
                        {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </h2>
                </Card>
            </div>

            {/* Per-asset breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Link href="/btc">
                    <Card hover className="flex items-center justify-between gap-4 group cursor-pointer">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                                <Bitcoin className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Bitcoin</p>
                                <p className="text-xs text-faint font-num">{totalBtc.toFixed(6)} BTC &middot; {fmt(btcInvested)} invested</p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                            <div>
                                <p className="text-sm font-medium font-num text-foreground">{fmt(btcCurrentValue)}</p>
                                <p className={cn("text-xs font-num", btcCurrentValue >= btcInvested ? "text-accent" : "text-red-400")}>
                                    {btcCurrentValue >= btcInvested ? '+' : ''}{fmt(btcCurrentValue - btcInvested)}
                                </p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-faint group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                    </Card>
                </Link>

                <Link href="/t212">
                    <Card hover className="flex items-center justify-between gap-4 group cursor-pointer">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center text-muted shrink-0">
                                <BarChart3 className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Trading 212</p>
                                <p className="text-xs text-faint font-num">
                                    {t212Connected ? `${fmt(t212InvestedUsd)} invested` : 'Not connected'}
                                </p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                            {t212Connected && t212Snapshot ? (
                                <div>
                                    <p className="text-sm font-medium font-num text-foreground">{fmt(t212CurrentValueUsd)}</p>
                                    <p className={cn("text-xs font-num", t212CurrentValueUsd >= t212InvestedUsd ? "text-accent" : "text-red-400")}>
                                        {t212CurrentValueUsd >= t212InvestedUsd ? '+' : ''}{fmt(t212CurrentValueUsd - t212InvestedUsd)}
                                    </p>
                                </div>
                            ) : (
                                <span className="text-xs text-primary font-medium">Connect in Admin</span>
                            )}
                            <ArrowRight className="w-4 h-4 text-faint group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                    </Card>
                </Link>
            </div>

            {/* Yearly / Monthly invested breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <h3 className="text-sm font-medium text-foreground mb-4">Invested by year</h3>
                    {yearlyRows.length === 0 ? (
                        <p className="text-muted text-sm py-6 text-center">No investments recorded yet.</p>
                    ) : (
                        <div className="space-y-0">
                            <div className="grid grid-cols-4 text-[10px] text-faint uppercase tracking-wider pb-2 border-b border-border">
                                <span>Year</span>
                                <span className="text-right">BTC</span>
                                <span className="text-right">T212</span>
                                <span className="text-right">Total</span>
                            </div>
                            {yearlyRows.map((row) => (
                                <div key={row.label} className="grid grid-cols-4 text-sm py-2.5 border-b border-border last:border-0 font-num">
                                    <span className="text-foreground font-medium">{row.label}</span>
                                    <span className="text-right text-muted">{row.btc > 0 ? fmt(row.btc) : '—'}</span>
                                    <span className="text-right text-muted">{row.t212 > 0 ? fmt(row.t212) : '—'}</span>
                                    <span className="text-right text-foreground font-medium">{fmt(row.total)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <Card>
                    <h3 className="text-sm font-medium text-foreground mb-4">Invested by month &middot; {currentYear}</h3>
                    {monthlyRows.length === 0 ? (
                        <p className="text-muted text-sm py-6 text-center">No investments recorded this year.</p>
                    ) : (
                        <div className="space-y-0">
                            <div className="grid grid-cols-4 text-[10px] text-faint uppercase tracking-wider pb-2 border-b border-border">
                                <span>Month</span>
                                <span className="text-right">BTC</span>
                                <span className="text-right">T212</span>
                                <span className="text-right">Total</span>
                            </div>
                            {monthlyRows.map((row) => (
                                <div key={row.label} className="grid grid-cols-4 text-sm py-2.5 border-b border-border last:border-0 font-num">
                                    <span className="text-foreground font-medium">{row.label}</span>
                                    <span className="text-right text-muted">{row.btc > 0 ? fmt(row.btc) : '—'}</span>
                                    <span className="text-right text-muted">{row.t212 > 0 ? fmt(row.t212) : '—'}</span>
                                    <span className="text-right text-foreground font-medium">{fmt(row.total)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {t212Connected && t212Snapshot && t212Snapshot.currency !== 'USD' && (
                <p className="text-[10px] text-faint text-center">
                    Trading212 amounts converted from {t212Snapshot.currency} to USD at the current exchange rate (&asymp;{fxRate.toFixed(4)}) — historical entries use today&apos;s rate, not the rate on the deposit date.
                </p>
            )}
        </DashboardLayout>
    );
}
