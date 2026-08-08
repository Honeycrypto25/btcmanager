import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, cn } from "@/components/ui/core";
import { db } from "@/lib/db";
import { TrendingUp, TrendingDown, PieChart, Link2, Clock } from "lucide-react";
import Link from 'next/link';
import { T212SyncButton } from "@/components/t212/T212SyncButton";

export default async function T212Page() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const account = await db.t212Account.findFirst({
        orderBy: { createdAt: "desc" },
    });

    if (!account) {
        return (
            <DashboardLayout>
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Trading 212
                    </h1>
                    <p className="text-muted text-sm">Your stocks &amp; ETF investments.</p>
                </div>
                <Card className="flex flex-col items-center text-center gap-4 py-16">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-border flex items-center justify-center text-muted">
                        <Link2 className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-foreground font-medium">Trading212 not configured</p>
                        <p className="text-muted text-sm max-w-sm">
                            Add T212_API_KEY and T212_API_SECRET as environment variables in Vercel to start tracking your positions here.
                        </p>
                    </div>
                    <Link href="/admin" className="text-primary text-sm font-medium hover:underline">
                        Go to Admin &rarr;
                    </Link>
                </Card>
            </DashboardLayout>
        );
    }

    const snapshot = await db.t212Snapshot.findFirst({
        where: { accountId: account.id },
        orderBy: { capturedAt: "desc" },
    });

    if (!snapshot) {
        return (
            <DashboardLayout>
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Trading 212
                    </h1>
                    <p className="text-muted text-sm">Your stocks &amp; ETF investments.</p>
                </div>
                <Card className="flex flex-col items-center text-center gap-4 py-16">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-foreground font-medium">Account connected — first sync pending</p>
                        <p className="text-muted text-sm max-w-sm">
                            {account.lastSyncError
                                ? `Last attempt failed: ${account.lastSyncError}`
                                : "Data will appear here shortly, or trigger a manual sync from Admin."}
                        </p>
                    </div>
                    <T212SyncButton />
                </Card>
            </DashboardLayout>
        );
    }

    const positions = (snapshot.positions as any[]) ?? [];
    const pies = (snapshot.pies as any[]) ?? [];
    const currencySymbol = snapshot.currency === 'USD' ? '$' : snapshot.currency === 'EUR' ? '\u20ac' : snapshot.currency === 'GBP' ? '\u00a3' : `${snapshot.currency} `;
    const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    const pnlPercent = snapshot.investedValue > 0 ? (snapshot.resultPpl / snapshot.investedValue) * 100 : 0;

    return (
        <DashboardLayout>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Trading 212
                    </h1>
                    <p className="text-muted text-sm">
                        Last synced {new Date(snapshot.capturedAt).toLocaleString()} &middot; {account.environment}
                    </p>
                </div>
                <T212SyncButton />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total value</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(snapshot.totalValue)}</h2>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Invested</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(snapshot.investedValue)}</h2>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Free cash</p>
                    <h2 className="text-2xl font-medium font-num text-foreground">{fmt(snapshot.freeCash)}</h2>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">P&amp;L</p>
                    <div className="flex items-center gap-2">
                        <h2 className={cn("text-2xl font-medium font-num", snapshot.resultPpl >= 0 ? "text-accent" : "text-red-400")}>
                            {snapshot.resultPpl >= 0 ? '+' : ''}{fmt(Math.abs(snapshot.resultPpl))}
                        </h2>
                        {snapshot.resultPpl >= 0 ? <TrendingUp className="w-4 h-4 text-accent" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </div>
                    <p className={cn("text-sm font-num mt-1", snapshot.resultPpl >= 0 ? "text-accent/80" : "text-red-400/80")}>
                        {pnlPercent.toFixed(2)}%
                    </p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Positions */}
                <Card>
                    <h3 className="text-sm font-medium text-foreground mb-4">Open positions</h3>
                    {positions.length === 0 ? (
                        <p className="text-muted text-sm py-6 text-center">No open positions.</p>
                    ) : (
                        <div className="divide-y divide-border">
                            {positions.map((p: any) => {
                                const value = (p.quantity ?? 0) * (p.currentPrice ?? 0);
                                const isProfit = (p.ppl ?? 0) >= 0;
                                return (
                                    <div key={p.ticker} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{p.ticker}</p>
                                            <p className="text-xs text-faint font-num">{p.quantity} &times; {fmt(p.currentPrice ?? 0)}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-medium font-num text-foreground">{fmt(value)}</p>
                                            <p className={cn("text-xs font-num", isProfit ? "text-accent" : "text-red-400")}>
                                                {isProfit ? '+' : ''}{fmt(p.ppl ?? 0)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                {/* Pies */}
                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <PieChart className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-medium text-foreground">Pies</h3>
                    </div>
                    {pies.length === 0 ? (
                        <p className="text-muted text-sm py-6 text-center">No pies found on this account.</p>
                    ) : (
                        <div className="divide-y divide-border">
                            {pies.map((pie: any) => {
                                const val = pie.result?.value ?? 0;
                                const invested = pie.result?.investedValue ?? 0;
                                const result = pie.result?.result ?? 0;
                                const isProfit = result >= 0;
                                return (
                                    <div key={pie.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{pie.name ?? `Pie #${pie.id}`}</p>
                                            <p className="text-xs text-faint font-num">Invested {fmt(invested)}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-medium font-num text-foreground">{fmt(val)}</p>
                                            <p className={cn("text-xs font-num", isProfit ? "text-accent" : "text-red-400")}>
                                                {isProfit ? '+' : ''}{fmt(result)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <p className="text-[10px] text-faint mt-4 leading-relaxed">
                        Pie values reflect Trading212&apos;s current allocation, including any automatic rebalancing.
                    </p>
                </Card>
            </div>
        </DashboardLayout>
    );
}
