export const dynamic = "force-dynamic";

import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, cn } from "@/components/ui/core";
import { db } from "@/lib/db";
import { ArrowLeft } from "lucide-react";
import Link from 'next/link';
import { PositionPriceChart } from "@/components/t212/PositionPriceChart";

interface PeriodRow {
    label: string;
    invested: number;
    value: number;
    pnl: number;
    pnlPercent: number;
}

function computeAsset(invested: number, value: number) {
    const pnl = value - invested;
    const pnlPercent = invested !== 0 ? (pnl / invested) * 100 : 0;
    return { pnl, pnlPercent };
}

export default async function PositionDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const { ticker } = await params;

    const account = await db.t212Account.findFirst({ orderBy: { createdAt: "desc" } });
    if (!account) notFound();

    const snapshot = await db.t212Snapshot.findFirst({
        where: { accountId: account.id },
        orderBy: { capturedAt: "desc" },
    });
    if (!snapshot) notFound();

    const positions = (snapshot.positions as any[]) ?? [];
    const position = positions.find((p) => p.ticker === ticker);
    if (!position) notFound();

    const orders = await db.t212Order.findMany({
        where: { accountId: account.id, ticker },
        orderBy: { filledAt: "desc" },
    });

    const currencySymbol = snapshot.currency === 'USD' ? '$' : snapshot.currency === 'EUR' ? '\u20ac' : snapshot.currency === 'GBP' ? '\u00a3' : `${snapshot.currency} `;
    const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    // Investit/valoare pe lună și an, pentru ACEST instrument — în moneda
    // contului (order.total e deja convertit de T212, nu în pence/etc).
    // Valoarea curentă per comandă folosește prețul curent per acțiune
    // (currentValue/quantity), la fel ca la restul aplicației.
    const currentValuePerShare = position.quantity > 0 ? position.currentValue / position.quantity : 0;

    const yearly = new Map<number, { invested: number; value: number }>();
    const monthly = new Map<string, { invested: number; value: number }>();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const addTo = (map: Map<any, { invested: number; value: number }>, key: any, invested: number, value: number) => {
        const existing = map.get(key) ?? { invested: 0, value: 0 };
        map.set(key, { invested: existing.invested + invested, value: existing.value + value });
    };

    for (const o of orders) {
        const d = new Date(o.filledAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        if (o.side === "BUY") {
            const value = currentValuePerShare > 0 ? o.quantity * currentValuePerShare : o.total;
            addTo(yearly, d.getFullYear(), o.total, value);
            addTo(monthly, monthKey, o.total, value);
        } else {
            addTo(yearly, d.getFullYear(), -o.total, -o.total);
            addTo(monthly, monthKey, -o.total, -o.total);
        }
    }

    const buildRow = (label: string, agg: { invested: number; value: number }): PeriodRow => {
        const { pnl, pnlPercent } = computeAsset(agg.invested, agg.value);
        return { label, invested: agg.invested, value: agg.value, pnl, pnlPercent };
    };

    const yearlyRows = Array.from(yearly.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([year, agg]) => buildRow(String(year), agg));

    const monthlyRows = Array.from(monthly.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, agg]) => {
            const [y, m] = key.split('-');
            return buildRow(`${monthNames[parseInt(m, 10) - 1]} ${y}`, agg);
        });

    const totalPnl = position.currentValue - position.cost;
    const totalPnlPercent = position.cost !== 0 ? (totalPnl / position.cost) * 100 : 0;

    return (
        <DashboardLayout>
            <Link href="/t212" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors w-fit">
                <ArrowLeft className="w-4 h-4" />
                Back to Trading 212
            </Link>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        {position.name ?? position.ticker}
                    </h1>
                    <p className="text-muted text-sm font-num">{position.ticker}</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-medium font-num text-foreground">{fmt(position.currentValue)}</p>
                    <p className={cn("text-sm font-num", totalPnl >= 0 ? "text-accent" : "text-red-400")}>
                        {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} ({totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%)
                    </p>
                </div>
            </div>

            <PositionPriceChart position={position} orders={orders as any} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PeriodTable title="Invested by year" rows={yearlyRows} fmt={fmt} />
                <PeriodTable title="Invested by month" rows={monthlyRows} fmt={fmt} scrollable />
            </div>
        </DashboardLayout>
    );
}

function PeriodTable({ title, rows, fmt, scrollable }: { title: string; rows: PeriodRow[]; fmt: (n: number) => string; scrollable?: boolean }) {
    return (
        <Card>
            <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-muted text-sm py-6 text-center">No activity recorded yet.</p>
            ) : (
                <>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(60px,auto)_minmax(60px,auto)_minmax(48px,auto)] gap-x-2 pb-1.5 border-b border-border">
                        <span />
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">Invested</span>
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">Value</span>
                        <span className="text-[10px] text-faint uppercase tracking-wider text-right">P&amp;L</span>
                    </div>
                    <div className={cn(scrollable && "max-h-[360px] overflow-y-auto pr-1")}>
                        {rows.map((row) => (
                            <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,auto)_minmax(60px,auto)_minmax(48px,auto)] gap-x-2 items-baseline py-2.5 border-b border-border last:border-0">
                                <span className="text-sm font-medium text-foreground truncate">{row.label}</span>
                                <span className="text-sm font-num text-foreground text-right">{row.invested !== 0 ? fmt(row.invested) : '\u2014'}</span>
                                <span className="text-sm font-num text-foreground text-right">{fmt(row.value)}</span>
                                <span className={cn("text-xs font-num text-right", row.invested !== 0 ? (row.pnlPercent >= 0 ? "text-accent" : "text-red-400") : "text-faint")}>
                                    {row.invested !== 0 ? `${row.pnlPercent >= 0 ? '+' : ''}${row.pnlPercent.toFixed(1)}%` : '\u2014'}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Card>
    );
}
