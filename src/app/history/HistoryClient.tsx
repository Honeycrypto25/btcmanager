
"use client";

import React, { useState, useMemo } from 'react';
import { Card, Button, cn } from "@/components/ui/core";
import {
    History,
    ExternalLink,
    Search,
    ArrowUpRight,
    Calendar,
    Filter,
    X,
    Check
} from "lucide-react";
import { format } from "date-fns";

interface HistoryClientProps {
    initialTransactions: any[];
}

export default function HistoryClient({ initialTransactions }: HistoryClientProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

    const [showDateModal, setShowDateModal] = useState(false);
    const [showFilterModal, setShowFilterModal] = useState(false);

    // Derived unique wallets for filter
    const uniqueWallets = useMemo(() => {
        const wallets = new Set<string>();
        initialTransactions.forEach(tx => {
            if (tx.wallet?.name) wallets.add(tx.wallet.name);
        });
        return Array.from(wallets);
    }, [initialTransactions]);

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        return initialTransactions.filter(tx => {
            // Search
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch =
                tx.txid.toLowerCase().includes(searchLower) ||
                tx.wallet?.name.toLowerCase().includes(searchLower);

            // Date Range
            let matchesDate = true;
            const txDate = new Date(tx.timestamp);
            if (startDate) {
                matchesDate = matchesDate && txDate >= new Date(startDate);
            }
            if (endDate) {
                // Set end date to end of day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchesDate = matchesDate && txDate <= end;
            }

            // Wallet Filter
            let matchesWallet = true;
            if (selectedWallet) {
                matchesWallet = tx.wallet?.name === selectedWallet;
            }

            return matchesSearch && matchesDate && matchesWallet;
        });
    }, [initialTransactions, searchQuery, startDate, endDate, selectedWallet]);

    const clearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSelectedWallet(null);
        setSearchQuery('');
        setShowDateModal(false);
        setShowFilterModal(false);
    };

    const hasActiveFilters = startDate || endDate || selectedWallet;

    return (
        <div className="space-y-6 relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-white mb-2">
                        Transaction <span className="gradient-text">History</span>
                    </h1>
                    <p className="text-gray-500 font-medium tracking-wide">
                        Detailed record of all monitored Bitcoin acquisitions.
                    </p>
                </div>
                <div className="flex gap-2 relative">
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={clearFilters}
                            className="rounded-2xl text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Clear
                        </Button>
                    )}
                    <Button
                        variant={startDate || endDate ? "primary" : "outline"}
                        size="md"
                        className="rounded-2xl"
                        onClick={() => {
                            setShowDateModal(!showDateModal);
                            setShowFilterModal(false);
                        }}
                    >
                        <Calendar className="w-4 h-4 mr-2" />
                        {startDate ? (endDate ? `${startDate} - ${endDate}` : `From ${startDate}`) : "Custom Range"}
                    </Button>
                    <Button
                        variant={selectedWallet ? "primary" : "outline"}
                        size="md"
                        className="rounded-2xl"
                        onClick={() => {
                            setShowFilterModal(!showFilterModal);
                            setShowDateModal(false);
                        }}
                    >
                        <Filter className="w-4 h-4 mr-2" />
                        {selectedWallet || "Filter"}
                    </Button>

                    {/* Date Modal */}
                    {showDateModal && (
                        <div className="absolute top-12 right-0 z-50 w-80">
                            <Card className="shadow-2xl border-white/10 bg-[#0A0A0A] p-4 animate-in fade-in zoom-in-95 duration-200">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Select Date Range</h3>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500">Start Date</label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full bg-[#151515] border border-white/5 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500">End Date</label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full bg-[#151515] border border-white/5 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setStartDate('');
                                                setEndDate('');
                                            }}
                                            className="flex-1"
                                        >
                                            Reset
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => setShowDateModal(false)}
                                            className="flex-1"
                                        >
                                            Done
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Filter Modal */}
                    {showFilterModal && (
                        <div className="absolute top-12 right-0 z-50 w-64">
                            <Card className="shadow-2xl border-white/10 bg-[#0A0A0A] p-4 animate-in fade-in zoom-in-95 duration-200">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Filter by Wallet</h3>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    <button
                                        onClick={() => setSelectedWallet(null)}
                                        className={cn(
                                            "w-full text-left px-4 py-3 rounded-xl text-sm transition-colors flex items-center justify-between group",
                                            !selectedWallet ? "bg-primary/10 text-primary font-bold" : "bg-[#151515] text-gray-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        All Wallets
                                        {!selectedWallet && <Check className="w-4 h-4" />}
                                    </button>
                                    {uniqueWallets.map(wallet => (
                                        <button
                                            key={wallet}
                                            onClick={() => setSelectedWallet(wallet === selectedWallet ? null : wallet)}
                                            className={cn(
                                                "w-full text-left px-4 py-3 rounded-xl text-sm transition-colors flex items-center justify-between group",
                                                selectedWallet === wallet ? "bg-primary/10 text-primary font-bold" : "bg-[#151515] text-gray-400 hover:bg-white/5 hover:text-white"
                                            )}
                                        >
                                            {wallet}
                                            {selectedWallet === wallet && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                                <div className="pt-4 mt-2 border-t border-white/5">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => setShowFilterModal(false)}
                                    >
                                        Done
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Summary for History */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <History className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest leading-tight">Total Syncs</p>
                        <p className="text-xl font-black text-white">{filteredTransactions.length}</p>
                    </div>
                </Card>
                <Card className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent border border-accent/20">
                        <ArrowUpRight className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest leading-tight">Last 30 Days</p>
                        <p className="text-xl font-black text-white">
                            {filteredTransactions.filter((t: any) => new Date(t.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length} Txs
                        </p>
                    </div>
                </Card>
            </div>

            {/* Search Filter Placeholder */}
            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                <input
                    placeholder="Search by TxID or Wallet Name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-glass border border-white/5 rounded-3xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-all"
                />
            </div>

            {/* Transactions Table */}
            <Card className="overflow-hidden p-0 border-white/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest">Date & Time</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest">Wallet</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest">Amount</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest">Price At Time</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest">USD Value</th>
                                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase font-black tracking-widest text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-gray-600 font-medium italic">
                                        No transactions found matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredTransactions.map((tx: any) => (
                                    <tr key={tx.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-5">
                                            <p className="text-sm font-bold text-white leading-tight">
                                                {format(new Date(tx.timestamp), 'MMM dd, yyyy')}
                                            </p>
                                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                                {format(new Date(tx.timestamp), 'HH:mm:ss')}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-primary/40" />
                                                <span className="text-sm font-bold text-gray-300">{tx.wallet?.name || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 font-mono text-sm">
                                            <span className="text-white font-bold">{tx.amount.toFixed(8)}</span>
                                            <span className="text-primary ml-1 text-[10px]">BTC</span>
                                        </td>
                                        <td className="px-6 py-5 text-sm text-gray-400 font-mono">
                                            ${tx.priceAtTime.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-5 text-sm text-accent font-black">
                                            ${(tx.amount * tx.priceAtTime).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <a
                                                href={`https://mempool.space/tx/${tx.txid}`}
                                                target="_blank"
                                                className="inline-flex items-center justify-center p-2 rounded-lg bg-glass border border-white/5 text-gray-500 hover:text-primary hover:border-primary/20 transition-all"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
