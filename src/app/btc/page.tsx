import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, Button } from "@/components/ui/core";
import {
  TrendingUp,
  TrendingDown,
  Bitcoin,
  Wallet,
  Scale
} from "lucide-react";
import { getCurrentBtcPrice } from "@/lib/btc";
import { db } from "@/lib/db";
import { cn } from "@/components/ui/core";
import Link from 'next/link';
import PriceChart from "@/components/dashboard/PriceChart";
import { DashboardRefreshButton } from "@/components/dashboard/DashboardRefreshButton";

export default async function DashboardPage() {
  const session = await requireSectionAccess("btc");

  // Fetch initial data
  const currentPrice = await getCurrentBtcPrice();
  const wallets = await db.bitcoinWallet.findMany({
    include: { transactions: true }
  });

  // Calculate Stats
  const totalBtc = wallets.reduce((acc: number, w: any) =>
    acc + w.transactions.reduce((tAcc: number, t: any) => tAcc + t.amount, 0), 0
  );
  const totalValueUsd = totalBtc * currentPrice;
  const totalInvested = wallets.reduce((acc: number, w: any) =>
    acc + w.transactions.reduce((tAcc: number, t: any) => tAcc + (t.amount * t.priceAtTime), 0), 0
  );
  const totalPnl = totalValueUsd - totalInvested;
  const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const avgBuyPrice = totalBtc > 0 ? totalInvested / totalBtc : 0;

  // Flatten transactions for the chart
  const allTransactions = wallets.flatMap((w: any) =>
    w.transactions.map((t: any) => ({
      ...t,
      wallet: { name: w.name }
    }))
  );

  return (
    <DashboardLayout>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
            Portfolio overview
          </h1>
          <p className="text-muted text-sm">
            Welcome back, {session.user?.email?.split('@')[0]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass px-4 py-2 rounded-lg flex items-center gap-2.5">
            <Bitcoin className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium font-num text-foreground">
              ${currentPrice.toLocaleString()}
            </span>
          </div>
          <DashboardRefreshButton />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total balance</p>
          <div className="space-y-1">
            <h2 className="text-2xl font-medium font-num text-foreground">${totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
            <p className="text-primary font-num text-sm">{totalBtc.toFixed(8)} BTC</p>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total invested</p>
          <div className="space-y-1">
            <h2 className="text-2xl font-medium font-num text-foreground">${totalInvested.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
            <p className="text-faint text-sm">Across {wallets.length} {wallets.length === 1 ? 'address' : 'addresses'}</p>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Avg. buy price</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Scale className="w-3.5 h-3.5 text-faint" />
              <h2 className="text-2xl font-medium font-num text-foreground">
                {avgBuyPrice > 0 ? `$${avgBuyPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
              </h2>
            </div>
            <p className="text-faint text-sm">Cost basis per BTC</p>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Total P&L</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className={cn("text-2xl font-medium font-num", totalPnl >= 0 ? "text-accent" : "text-red-400")}>
                {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </h2>
              {totalPnl >= 0 ? <TrendingUp className="w-4 h-4 text-accent" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            </div>
            <p className={cn("text-sm font-num", totalPnl >= 0 ? "text-accent/80" : "text-red-400/80")}>
              {pnlPercent.toFixed(2)}% ROI
            </p>
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PriceChart transactions={allTransactions} />
        </div>

        <Card className="space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-foreground">Top addresses</h3>
            <Link href="/btc/wallets">
              <Button variant="ghost" size="sm" className="text-xs">View all</Button>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {wallets.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-muted text-sm">No addresses found</p>
                <Link href="/btc/wallets">
                  <Button variant="outline" size="sm">Add address</Button>
                </Link>
              </div>
            ) : (
              wallets.slice(0, 5).map((w: any) => {
                const btcBalance = w.transactions.reduce((acc: number, t: any) => acc + t.amount, 0);
                const invested = w.transactions.reduce((acc: number, t: any) => acc + (t.amount * t.priceAtTime), 0);
                const currentValue = btcBalance * currentPrice;
                const isProfit = currentValue - invested >= 0;

                return (
                  <div key={w.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight truncate">{w.name}</p>
                      <p className="text-xs text-faint font-num">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-sm font-medium font-num", isProfit ? "text-accent" : "text-foreground")}>
                        ${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-faint font-num">{btcBalance.toFixed(4)} BTC</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
