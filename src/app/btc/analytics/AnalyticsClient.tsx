
"use client";

import React, { useState, useMemo } from 'react';
import { Card, cn } from "@/components/ui/core";
import { Wallet, Check, X, LineChart } from "lucide-react";
import AdvancedChart from "@/components/analytics/AdvancedChart";
import AvgCostChart from "@/components/analytics/AvgCostChart";

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
                <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1 flex items-center gap-3">
                    <LineChart className="w-8 h-8 text-primary" />
                    Analytics <span className="gradient-text">& Charts</span>
                </h1>
                <p className="text-muted text-sm">
                    Visual analysis of your purchase history across wallets.
                </p>
            </div>

            {/* Wallet Filter */}
            <Card className="p-4 border-border space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-muted" />
                        Filter by Wallet
                    </h3>
                    <button
                        onClick={toggleAll}
                        className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-foreground transition-colors"
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
                                        ? "bg-primary text-black border-primary"
                                        : "bg-glass border-border text-muted hover:border-white/20 hover:text-foreground"
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
            <div className="grid grid-cols-1 gap-4">
                <div className="min-h-[500px]">
                    <AdvancedChart transactions={filteredTransactions} />
                </div>
                <AvgCostChart transactions={filteredTransactions} />
            </div>
        </div>
    );
}
