
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
    Percent
} from "lucide-react";

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
    overall: {
        totalInvested: number;
        totalBtc: number;
        currentValue: number;
        roiPercentage: number;
    };
}

export default function RoiClient({ yearlyData, monthlyData, currentPrice, overall }: RoiClientProps) {
    const [view, setView] = useState<'yearly' | 'monthly'>('yearly');

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const formatBtc = (val: number) =>
        new Intl.NumberFormat('en-US', { minimumFractionDigits: 8 }).format(val);

    const formatPercent = (val: number) =>
        `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-white mb-2">
                        ROI & <span className="gradient-text">Analytics</span>
                    </h1>
                    <p className="text-gray-500 font-medium tracking-wide">
                        Track your investment performance over time.
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-glass border border-white/5 rounded-2xl p-1">
                    <button
                        onClick={() => setView('yearly')}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                            view === 'yearly' ? "bg-primary text-black shadow-lg" : "text-gray-500 hover:text-white"
                        )}
                    >
                        Yearly
                    </button>
                    <button
                        onClick={() => setView('monthly')}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                            view === 'monthly' ? "bg-primary text-black shadow-lg" : "text-gray-500 hover:text-white"
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
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Total Invested</p>
                    <p className="text-3xl font-black text-white">{formatCurrency(overall.totalInvested)}</p>
                </Card>
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp className="w-24 h-24 text-green-500" />
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Current Value</p>
                    <p className="text-3xl font-black text-white">{formatCurrency(overall.currentValue)}</p>
                    <p className="text-xs text-gray-500 mt-1 font-mono">@ {formatCurrency(currentPrice)}</p>
                </Card>
                <Card className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Bitcoin className="w-24 h-24 text-orange-500" />
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Total BTC</p>
                    <p className="text-3xl font-black text-white">{formatBtc(overall.totalBtc)}</p>
                </Card>
                <Card className={cn(
                    "p-6 relative overflow-hidden group border",
                    overall.roiPercentage >= 0 ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                )}>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Percent className={cn("w-24 h-24", overall.roiPercentage >= 0 ? "text-green-500" : "text-red-500")} />
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Total ROI</p>
                    <div className="flex items-baseline gap-2">
                        <p className={cn("text-3xl font-black", overall.roiPercentage >= 0 ? "text-green-500" : "text-red-500")}>
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

            {/* Data Table */}
            <Card className="overflow-hidden p-0 border-white/5">
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        {view === 'yearly' ? 'Yearly Performance' : 'Monthly Breakdown'}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01]">
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest">Period</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest text-right">Invested</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest text-right">Current Value</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest text-right">BTC Acquired</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest text-right">Avg Price</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest text-right">ROI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {(view === 'yearly' ? yearlyData : monthlyData).map((row) => (
                                <tr key={row.period} className="hover:bg-white/[0.01] transition-colors group">
                                    <td className="px-6 py-5 font-bold text-white">
                                        {row.period}
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono text-gray-400">
                                        {formatCurrency(row.totalInvested)}
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono text-white">
                                        {formatCurrency(row.currentValue)}
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono text-white font-bold">
                                        {row.totalBtc.toFixed(8)} <span className="text-primary text-[10px]">BTC</span>
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono text-gray-400">
                                        {formatCurrency(row.totalInvested / row.totalBtc)}
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
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
