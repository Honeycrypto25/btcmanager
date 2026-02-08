import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, Button } from "@/components/ui/core";
import {
  TrendingUp,
  TrendingDown,
  Bitcoin,
  Wallet,
  ArrowUpRight,
  RefreshCcw,
  Activity
} from "lucide-react";
import { getCurrentBtcPrice } from "@/lib/btc";
import { db } from "@/lib/db";
import { cn } from "@/components/ui/core";
import Link from 'next/link';
import PriceChart from "@/components/dashboard/PriceChart";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

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
          <h1 className="text-4xl font-black tracking-tight text-white mb-2">
            Portfolio <span className="gradient-text">Overview</span>
          </h1>
          <p className="text-gray-500 font-medium tracking-wide">
            Welcome back, {session.user?.email?.split('@')[0]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass px-4 py-2 rounded-2xl flex items-center gap-3 border-orange-500/20 shadow-[0_0_20px_rgba(247,147,26,0.1)]">
            <Bitcoin className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold tracking-tight text-white">
              ${currentPrice.toLocaleString()}
            </span>
          </div>
          <Button variant="outline" size="icon" className="rounded-2xl">
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card hover className="relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Wallet className="w-32 h-32" />
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Total Balance</p>
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-white">${totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
            <p className="text-primary font-mono text-sm">{totalBtc.toFixed(8)} BTC</p>
          </div>
        </Card>

        <Card hover className="relative overflow-hidden group border-accent/20">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Total PNL</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className={cn("text-3xl font-black", totalPnl >= 0 ? "text-accent" : "text-red-500")}>
                {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </h2>
              <div className={cn("px-2 py-0.5 rounded-lg text-[10px] font-bold", totalPnl >= 0 ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-500")}>
                {totalPnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              </div>
            </div>
            <p className={cn("font-bold text-sm", totalPnl >= 0 ? "text-accent/80" : "text-red-400")}>
              {pnlPercent.toFixed(2)}% ROI
            </p>
          </div>
        </Card>

        <Card hover className="relative overflow-hidden group">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Total Invested</p>
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-white">${totalInvested.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
            <p className="text-gray-500 text-sm italic">Accumulated across {wallets.length} addresses</p>
          </div>
        </Card>

        <Card hover className="relative overflow-hidden group">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Daily Activity</p>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-white font-bold">12 Syncs</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Last 24 hours</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Area (Chart Placeholder) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 min-h-[400px] flex flex-col relative overflow-hidden">
          <PriceChart transactions={allTransactions} />
        </Card>

        <Card className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white">Top Addresses</h3>
            <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase tracking-widest">View All</Button>
          </div>
          <div className="space-y-4">
            {wallets.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-gray-600 text-sm">No addresses found</p>
                <Link href="/wallets">
                  <Button variant="outline" size="sm">Add Address</Button>
                </Link>
              </div>
            ) : (
              wallets.slice(0, 4).map((w: any, i: number) => {
                const btcBalance = w.transactions.reduce((acc: number, t: any) => acc + t.amount, 0);
                const invested = w.transactions.reduce((acc: number, t: any) => acc + (t.amount * t.priceAtTime), 0);
                const currentValue = btcBalance * currentPrice;
                const pnl = currentValue - invested;
                const isProfit = pnl >= 0;

                return (
                  <div key={w.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center p-3 rounded-2xl hover:bg-glass transition-colors group cursor-pointer border border-transparent hover:border-white/5">
                    <div className="w-8 h-8 rounded-lg bg-[#151515] flex items-center justify-center text-gray-500 group-hover:text-primary group-hover:bg-primary/5 transition-all">
                      <span className="text-xs font-bold">{i + 1}</span>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{w.name}</p>
                      <p className="text-[10px] text-gray-600 font-mono">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                    </div>

                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Invested</p>
                      <p className="text-sm font-medium text-gray-400">${invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>

                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Current</p>
                      <p className={cn("text-sm font-bold", isProfit ? "text-accent" : "text-white")}>
                        ${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider sm:hidden">Balance</p>
                      <p className="text-sm font-bold text-white">{btcBalance.toFixed(4)} BTC</p>
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

