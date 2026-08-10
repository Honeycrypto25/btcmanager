export const dynamic = "force-dynamic";

import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/components/ui/core";
import { db } from "@/lib/db";
import { ArrowLeft } from "lucide-react";
import Link from 'next/link';
import { PositionPriceChart } from "@/components/t212/PositionPriceChart";
import { PeriodBreakdownToggle, type PeriodRow } from "@/components/t212/PeriodBreakdownToggle";

function computeAsset(invested: number, value: number) {
    const pnl = value - invested;
    const pnlPercent = invested !== 0 ? (pnl / invested) * 100 : 0;
    return { pnl, pnlPercent };
}

/** Luni a săptămânii care conține data dată, la miezul nopții — folosit ca cheie de sortare/grupare */
function mondayOf(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day + 6) % 7; // zile de la ultima luni
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diff);
    return d;
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

    // Investit/valoare pe săptămână, lună și an, pentru ACEST instrument — în
    // moneda contului (order.total e deja convertit de T212, nu în pence/etc).
    // Valoarea curentă per comandă folosește prețul curent per acțiune
    // (currentValue/quantity), la fel ca la restul aplicației.
    const currentValuePerShare = position.quantity > 0 ? position.currentValue / position.quantity : 0;

    const weekly = new Map<string, { invested: number; value: number; label: string }>();
    const yearly = new Map<number, { invested: number; value: number }>();
    const monthly = new Map<string, { invested: number; value: number }>();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const addTo = <K,>(map: Map<K, { invested: number; value: number }>, key: K, invested: number, value: number) => {
        const existing = map.get(key) ?? { invested: 0, value: 0 };
        map.set(key, { invested: existing.invested + invested, value: existing.value + value });
    };

    for (const o of orders) {
        const d = new Date(o.filledAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monday = mondayOf(d);
        const weekKey = monday.toISOString().slice(0, 10);
        const weekLabel = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const investedDelta = o.side === "BUY" ? o.total : -o.total;
        const valueDelta = o.side === "BUY"
            ? (currentValuePerShare > 0 ? o.quantity * currentValuePerShare : o.total)
            : -o.total;

        addTo(yearly, d.getFullYear(), investedDelta, valueDelta);
        addTo(monthly, monthKey, investedDelta, valueDelta);

        const existingWeek = weekly.get(weekKey) ?? { invested: 0, value: 0, label: weekLabel };
        weekly.set(weekKey, { invested: existingWeek.invested + investedDelta, value: existingWeek.value + valueDelta, label: weekLabel });
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

    const weeklyRows = Array.from(weekly.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([, agg]) => buildRow(agg.label, agg));

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

            <PeriodBreakdownToggle
                title="Invested"
                weeklyRows={weeklyRows}
                monthlyRows={monthlyRows}
                yearlyRows={yearlyRows}
                currencySymbol={currencySymbol}
            />
        </DashboardLayout>
    );
}
