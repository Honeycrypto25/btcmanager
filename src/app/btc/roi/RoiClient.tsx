
"use client";

import React, { useState } from 'react';
import { Card, cn } from "@/components/ui/core";
import {
    TrendingUp,
    Calendar,
    DollarSign,
    Bitcoin,
    ArrowUpRight,
    ArrowDownRight,
    Percent,
    Hash,
    Scale,
    Zap,
    Clock
} from "lucide-react";
import PriceChart from "@/components/dashboard/PriceChart";
import RoiEvolutionChart from "./RoiEvolutionChart";

interface RoiData {
    period: string; // "2024" or "2024-01"
    totalInvested: number;
    totalBtc: number;
    costBasis: number; // Same as totalInvested for now, but could differ if fees are separated
    currentValue: number;
    roiPercentage: number;
    roiAmount: number;
}

interface RoiClientProps {
    yearlyData: RoiData[];
    monthlyData: RoiData[];
    currentPrice: number;
    transactions: any[];
    usdToGbp: number;
    overall: {
        totalInvested: number;
        totalBtc: number;
        currentValue: number;
        roiPercentage: number;
    };
    extraStats: {
        totalPurchases: number;
        avgBuyPrice: number;
        largestPurchase: { amountUsd: number; date: string; wallet: string } | null;
        firstPurchaseDate: string | null;
        daysInvesting: number;
    };
}

export default function RoiClient({ yearlyData, monthlyData, currentPrice, transactions, usdToGbp, overall, extraStats }: RoiClientProps) {
    const [view, setView] = useState<'yearly' | 'monthly'>('yearly');
    const [yearlyPage, setYearlyPage] = useState(1);
    const [monthlyPage, setMonthlyPage] = useState(1);
    const itemsPerPage = 10;

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const formatBtc = (val: number) =>
        new Intl.NumberFormat('en-US', { minimumFractionDigits: 8 }).format(val);

    const formatPercent = (val: number) =>
        `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;

    // Pagination logic
    const currentPage = view === 'yearly' ? yearlyPage : monthlyPage;
    const setCurrentPage = view === 'yearly' ? setYearlyPage : setMonthlyPage;
    const currentData = view === 'yearly' ? yearlyData : monthlyData;

    const totalPages = Math.ceil(currentData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = currentData.slice(startIndex, endIndex);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        ROI & <span className="gradient-text">Analytics</span>
                    </h1>
                    <p className="text-muted text-sm">
                        Track your investment performance over time.
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-glass border border-border rounded-2xl p-1">
                    <button
                        onClick={() => {
                            setView('yearly');
                            if (yearlyPage > Math.ceil(yearlyData.length / itemsPerPage)) {
                                setYearlyPage(1);
                            }
                        }}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                            view === 'yearly' ? "bg-primary text-black" : "text-muted hover:text-foreground"
                        )}
                    >
                        Yearly
                    </button>
                    <button
                        onClick={() => {
                            setView('monthly');
                            if (monthlyPage > Math.ceil(monthlyData.length / itemsPerPage)) {
                                setMonthlyPage(1);
                            }
                        }}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                            view === 'monthly' ? "bg-primary text-black" : "text-muted hover:text-foreground"
                        )}
                    >
                        Monthly
                    </button>
                </div>
            </div>

            {/* Overall Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <DollarSign className="w-24 h-24 text-primary" />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Total Invested</p>
                    <p className="text-3xl font-medium text-foreground">{formatCurrency(overall.totalInvested)}</p>
                </Card>
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp className="w-24 h-24 text-green-500" />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Current Value</p>
                    <p className="text-3xl font-medium text-foreground">{formatCurrency(overall.currentValue)}</p>
                    <p className="text-xs text-muted mt-1 font-mono">@ {formatCurrency(currentPrice)}</p>
                </Card>
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Bitcoin className="w-24 h-24 text-orange-500" />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Total BTC</p>
                    <p className="text-3xl font-medium text-foreground">{formatBtc(overall.totalBtc)}</p>
                </Card>
                <Card className={cn(
                    "p-6 relative overflow-hidden group border",
                    overall.roiPercentage >= 0 ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                )}>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Percent className={cn("w-24 h-24", overall.roiPercentage >= 0 ? "text-green-500" : "text-red-500")} />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Total ROI</p>
                    <div className="flex items-baseline gap-2">
                        <p className={cn("text-3xl font-medium", overall.roiPercentage >= 0 ? "text-green-500" : "text-red-500")}>
                            {formatPercent(overall.roiPercentage)}
                        </p>
                        {overall.roiPercentage >= 0 ? (
                            <ArrowUpRight className="w-5 h-5 text-green-500" />
                        ) : (
                            <ArrowDownRight className="w-5 h-5 text-red-500" />
                        )}
                    </div>
                </Card>
            </div>

            {/* Second row — activity/behavior stats, all derived from the transaction history already loaded above */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Hash className="w-24 h-24 text-primary" />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Total Purchases</p>
                    <p className="text-3xl font-medium text-foreground">{extraStats.totalPurchases}</p>
                </Card>
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Scale className="w-24 h-24 text-accent" />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Average Buy Price</p>
                    <p className="text-3xl font-medium text-foreground">{formatCurrency(extraStats.avgBuyPrice)}</p>
                    <p className="text-xs text-muted mt-1">per BTC, all-time</p>
                </Card>
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Zap className="w-24 h-24 text-orange-500" />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Largest Purchase</p>
                    <p className="text-3xl font-medium text-foreground">
                        {extraStats.largestPurchase ? formatCurrency(extraStats.largestPurchase.amountUsd) : "—"}
                    </p>
                    {extraStats.largestPurchase && (
                        <p className="text-xs text-muted mt-1 font-mono">
                            {new Date(extraStats.largestPurchase.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {extraStats.largestPurchase.wallet ? ` · ${extraStats.largestPurchase.wallet}` : ""}
                        </p>
                    )}
                </Card>
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Clock className="w-24 h-24 text-primary" />
                    </div>
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-1">Investing Since</p>
                    <p className="text-3xl font-medium text-foreground">{extraStats.daysInvesting}d</p>
                    {extraStats.firstPurchaseDate && (
                        <p className="text-xs text-muted mt-1 font-mono">
                            since {new Date(extraStats.firstPurchaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                    )}
                </Card>
            </div>

            {/* Price Chart */}
            <PriceChart transactions={transactions} />

            <RoiEvolutionChart transactions={transactions} usdToGbp={usdToGbp} />

            {/* Data Table */}
            <Card className="overflow-hidden p-0 border-border">
                <div className="px-6 py-4 border-b border-border bg-white/[0.02] flex justify-between items-center">
                    <h3 className="font-bold text-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        {view === 'yearly' ? 'Yearly Performance' : 'Monthly Breakdown'}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.01]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Period</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Invested</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Current Value</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">BTC Acquired</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Avg Price</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Profit</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">ROI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-faint font-medium italic">
                                        No data available for this period.
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((row) => (
                                    <tr key={row.period} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-5 font-bold text-foreground">
                                            {row.period}
                                        </td>
                                        <td className="px-6 py-5 text-right font-mono text-muted">
                                            {formatCurrency(row.totalInvested)}
                                        </td>
                                        <td className="px-6 py-5 text-right font-mono text-foreground">
                                            {formatCurrency(row.currentValue)}
                                        </td>
                                        <td className="px-6 py-5 text-right font-mono text-foreground font-bold">
                                            {row.totalBtc.toFixed(8)} <span className="text-primary text-[10px]">BTC</span>
                                        </td>
                                        <td className="px-6 py-5 text-right font-mono text-muted">
                                            {formatCurrency(row.totalInvested / row.totalBtc)}
                                        </td>
                                        <td className={cn(
                                            "px-6 py-5 text-right font-mono font-bold",
                                            row.roiAmount >= 0 ? "text-green-500" : "text-red-500"
                                        )}>
                                            {row.roiAmount >= 0 ? '+' : ''}{formatCurrency(row.roiAmount)}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <span className={cn(
                                                "inline-flex items-center gap-1 font-bold px-2 py-1 rounded-lg text-xs",
                                                row.roiPercentage >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                            )}>
                                                {formatPercent(row.roiPercentage)}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                        <p className="text-sm text-muted">
                            Showing <span className="font-bold text-foreground">{startIndex + 1}</span> to{' '}
                            <span className="font-bold text-foreground">{Math.min(endIndex, currentData.length)}</span> of{' '}
                            <span className="font-bold text-foreground">{currentData.length}</span> {view === 'yearly' ? 'years' : 'months'}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                                    currentPage === 1
                                        ? "bg-glass text-faint cursor-not-allowed"
                                        : "bg-glass text-foreground hover:bg-white/10"
                                )}
                            >
                                Previous
                            </button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={cn(
                                            "w-8 h-8 rounded-lg text-sm font-bold transition-all",
                                            currentPage === page
                                                ? "bg-primary text-black"
                                                : "bg-glass text-muted hover:bg-white/5 hover:text-foreground"
                                        )}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                                    currentPage === totalPages
                                        ? "bg-glass text-faint cursor-not-allowed"
                                        : "bg-glass text-foreground hover:bg-white/10"
                                )}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
