export const dynamic = "force-dynamic";

import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, cn } from "@/components/ui/core";
import { db } from "@/lib/db";
import { TrendingUp, TrendingDown, PieChart, Link2, Clock, ArrowUpDown, Repeat } from "lucide-react";
import Link from 'next/link';
import { T212SyncButton } from "@/components/t212/T212SyncButton";
import { PositionsList } from "@/components/t212/PositionsList";

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

    const allOrders = await db.t212Order.findMany({
        where: { accountId: account.id },
        orderBy: { filledAt: "desc" },
    });
    const orders = allOrders.slice(0, 50);

    const cashFlows = await db.t212CashFlow.findMany({
        where: { accountId: account.id },
        orderBy: { dateTime: "desc" },
        take: 20,
    });

    // Statistici din vânzări realizate — inclusiv rebalansări de pie (vinde X,
    // cumpără Y). Randamentul e calculat față de costul mediu al acțiunilor
    // vândute (cost = valoare vânzare - profit realizat), la fel ca în T212.
    // Calculat din SETUL COMPLET de comenzi, nu doar cele 50 afișate în listă.
    const sellOrders = allOrders.filter((o: any) => o.side === 'SELL');
    const realizedProfit = sellOrders.reduce((acc: number, o: any) => acc + (o.realizedProfit ?? 0), 0);
    const soldValue = sellOrders.reduce((acc: number, o: any) => acc + o.total, 0);
    const soldCostBasis = soldValue - realizedProfit;
    const realizedReturnPercent = soldCostBasis > 0 ? (realizedProfit / soldCostBasis) * 100 : 0;

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

            {account.lastSyncError && (
                <div className="bg-orange-500/10 border border-orange-500/20 text-orange-300 text-sm p-3 rounded-lg flex items-start gap-2">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{account.lastSyncError}</span>
                </div>
            )}

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
                <PositionsList positions={positions} currencySymbol={currencySymbol} />

                {/* Pies */}
                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <PieChart className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-medium text-foreground">Pies</h3>
                    </div>
                    {(() => {
                        const enrichedPies = pies.map((pie: any) => ({
                            pie,
                            val: pie.result?.value ?? pie.value ?? pie.totalResult?.value ?? 0,
                            invested: pie.result?.investedValue ?? pie.investedValue ?? pie.totalResult?.investedValue ?? 0,
                        }));
                        const nonEmptyPies = enrichedPies.filter((p: any) => p.val !== 0 || p.invested !== 0);

                        if (pies.length === 0) {
                            return <p className="text-muted text-sm py-6 text-center">No pies found on this account.</p>;
                        }
                        if (nonEmptyPies.length === 0) {
                            return (
                                <p className="text-muted text-sm py-6 text-center">
                                    {pies.length} pie{pies.length === 1 ? '' : 's'} found, but all show £0 &mdash; likely empty/unused.
                                </p>
                            );
                        }
                        return (
                            <div className="divide-y divide-border">
                                {nonEmptyPies.map(({ pie, val, invested }: any) => {
                                    const result = pie.result?.result ?? pie.result?.priceAvgResult ?? (val - invested);
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
                        );
                    })()}
                    <p className="text-[10px] text-faint mt-4 leading-relaxed">
                        Pie values reflect Trading212&apos;s current allocation, including any automatic rebalancing.
                    </p>
                </Card>
            </div>

            {/* Orders (buy/sell history) */}
            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <Repeat className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">Buy &amp; sell orders</h3>
                </div>

                {sellOrders.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 pb-5 border-b border-border">
                        <div>
                            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1.5">Realized P&amp;L from sales</p>
                            <p className={cn("text-lg font-medium font-num", realizedProfit >= 0 ? "text-accent" : "text-red-400")}>
                                {realizedProfit >= 0 ? '+' : ''}{fmt(realizedProfit)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1.5">Sold value</p>
                            <p className="text-lg font-medium font-num text-foreground">{fmt(soldValue)}</p>
                            <p className="text-xs text-faint">{sellOrders.length} sale{sellOrders.length === 1 ? '' : 's'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1.5">Realized return</p>
                            <p className={cn("text-lg font-medium font-num", realizedReturnPercent >= 0 ? "text-accent" : "text-red-400")}>
                                {realizedReturnPercent >= 0 ? '+' : ''}{realizedReturnPercent.toFixed(2)}%
                            </p>
                            <p className="text-xs text-faint">vs. average cost</p>
                        </div>
                    </div>
                )}
                {orders.length === 0 ? (
                    <p className="text-muted text-sm py-6 text-center">No filled orders recorded yet.</p>
                ) : (
                    <div className="divide-y divide-border max-h-[400px] overflow-y-auto pr-1">
                        {orders.map((o: any) => {
                            const isSell = o.side === 'SELL';
                            return (
                                <div key={o.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            {isSell ? 'Sell' : 'Buy'} &middot; {o.name || o.ticker}
                                        </p>
                                        <p className="text-xs text-faint font-num">
                                            {new Date(o.filledAt).toLocaleDateString()} &middot; {o.quantity} {o.ticker}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={cn("text-sm font-medium font-num", isSell ? "text-red-400" : "text-foreground")}>
                                            {isSell ? '\u2212' : ''}{fmt(o.total)}
                                        </p>
                                        {o.realizedProfit !== null && o.realizedProfit !== undefined && (
                                            <p className={cn("text-xs font-num", o.realizedProfit >= 0 ? "text-accent" : "text-red-400")}>
                                                {o.realizedProfit >= 0 ? '+' : ''}{fmt(o.realizedProfit)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* Cash transactions (deposits/withdrawals) — secondary, may be empty for
                accounts funded via recurring auto-invest rather than manual deposits. */}
            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <ArrowUpDown className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">Deposits &amp; withdrawals</h3>
                </div>
                {cashFlows.length === 0 ? (
                    <p className="text-muted text-sm py-6 text-center">
                        No deposit/withdrawal transactions recorded — this is expected if the account is funded via
                        recurring auto-invest, where money goes straight into buy orders above.
                    </p>
                ) : (
                    <div className="divide-y divide-border max-h-[300px] overflow-y-auto pr-1">
                        {cashFlows.map((cf: any) => {
                            const isOut = cf.type === 'WITHDRAW';
                            return (
                                <div key={cf.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground capitalize">{cf.type.toLowerCase()}</p>
                                        <p className="text-xs text-faint font-num">{new Date(cf.dateTime).toLocaleDateString()}</p>
                                    </div>
                                    <p className={cn("text-sm font-medium font-num shrink-0", isOut ? "text-red-400" : "text-accent")}>
                                        {isOut ? '\u2212' : '+'}{fmt(Math.abs(cf.amount))}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
                {account.lastTxSyncInfo && (
                    <p className="text-[10px] text-faint mt-4 pt-4 border-t border-border font-num leading-relaxed break-words">
                        Last sync diagnostic: {account.lastTxSyncInfo}
                    </p>
                )}
            </Card>
        </DashboardLayout>
    );
}
