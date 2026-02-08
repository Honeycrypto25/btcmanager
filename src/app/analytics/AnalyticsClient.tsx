
"use client";

import React, { useState, useMemo } from 'react';
import { Card, cn } from "@/components/ui/core";
import { Wallet, Check, X, LineChart } from "lucide-react";
import AdvancedChart from "@/components/analytics/AdvancedChart";

interface Transaction {
    id: string;
    amount: number;
    priceAtTime: number;
    timestamp: string | Date;
    walletId: string;
    wallet?: { name: string };
}

interface WalletData {
    id: string;
    name: string;
    address: string;
}

interface AnalyticsClientProps {
    wallets: WalletData[];
    transactions: Transaction[];
}

export default function AnalyticsClient({ wallets, transactions }: AnalyticsClientProps) {
    // Default to all selected
    const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>(wallets.map(w => w.id));

    const toggleWallet = (id: string) => {
        setSelectedWalletIds(prev =>
            prev.includes(id)
                ? prev.filter(wId => wId !== id)
                : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedWalletIds.length === wallets.length) {
            setSelectedWalletIds([]);
        } else {
            setSelectedWalletIds(wallets.map(w => w.id));
        }
    };

    const filteredTransactions = useMemo(() => {
        return transactions.filter(tx => selectedWalletIds.includes(tx.walletId));
    }, [transactions, selectedWalletIds]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-black tracking-tight text-white mb-2 flex items-center gap-3">
                    <LineChart className="w-8 h-8 text-primary" />
                    Analytics <span className="gradient-text">& Charts</span>
                </h1>
                <p className="text-gray-500 font-medium tracking-wide">
                    Visual analysis of your purchase history across wallets.
                </p>
            </div>

            {/* Wallet Filter */}
            <Card className="p-4 border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-gray-500" />
                        Filter by Wallet
                    </h3>
                    <button
                        onClick={toggleAll}
                        className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-white transition-colors"
                    >
                        {selectedWalletIds.length === wallets.length ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                <div className="flex flex-wrap gap-2">
                    {wallets.map(wallet => {
                        const isSelected = selectedWalletIds.includes(wallet.id);
                        return (
                            <button
                                key={wallet.id}
                                onClick={() => toggleWallet(wallet.id)}
                                className={cn(
                                    "px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2",
                                    isSelected
                                        ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(247,147,26,0.2)]"
                                        : "bg-glass border-white/5 text-gray-500 hover:border-white/20 hover:text-white"
                                )}
                            >
                                {wallet.name}
                                {isSelected ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 opacity-50" />}
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* Chart Area */}
            <div className="grid grid-cols-1">
                <div className="min-h-[500px]">
                    <AdvancedChart transactions={filteredTransactions} />
                </div>
            </div>
        </div>
    );
}
