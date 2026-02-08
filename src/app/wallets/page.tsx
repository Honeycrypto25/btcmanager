"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, Button, cn } from "@/components/ui/core";
import {
    Plus,
    Trash2,
    Search,
    Bitcoin,
    ExternalLink,
    RefreshCcw,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Box
} from "lucide-react";
import axios from 'axios';

interface Wallet {
    id: string;
    name: string;
    address: string;
    _count?: { transactions: number };
    createdAt: string;
}

export default function WalletsPage() {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');

    // Create Wallet State
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [syncingAll, setSyncingAll] = useState(false);

    const fetchWallets = async () => {
        try {
            const { data } = await axios.get('/api/wallets');
            setWallets(data);
        } catch (err) {
            console.error('Failed to fetch wallets');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWallets();
    }, []);

    const handleAddWallet = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);
        setError(null);
        try {
            await axios.post('/api/wallets', { name: newName, address: newAddress });
            setNewName('');
            setNewAddress('');
            setShowAddForm(false);
            fetchWallets();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to add wallet');
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteWallet = async (id: string) => {
        if (!confirm('Are you sure you want to delete this address? All history will be removed.')) return;
        try {
            await axios.delete(`/api/wallets?id=${id}`);
            fetchWallets();
        } catch (err) {
            alert('Failed to delete wallet');
        }
    };

    const handleSyncWallet = async (id: string) => {
        setSyncing(id);
        try {
            await axios.put(`/api/wallets?id=${id}`);
            await fetchWallets();
        } catch (err) {
            console.error("Sync failed", err);
            alert("Failed to sync wallet. Please try again.");
        } finally {
            setSyncing(null);
        }
    };

    const handleRefreshAll = async () => {
        setSyncingAll(true);
        try {
            await axios.put('/api/wallets'); // No ID means sync all
            await fetchWallets();
        } catch (err) {
            console.error("Sync all failed", err);
            alert("Failed to sync all wallets.");
        } finally {
            setSyncingAll(false);
        }
    };

    const filteredWallets = wallets.filter(w =>
        w.name.toLowerCase().includes(query.toLowerCase()) ||
        w.address.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <DashboardLayout>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-white mb-2">
                        Address <span className="gradient-text">Management</span>
                    </h1>
                    <p className="text-gray-500 font-medium tracking-wide">
                        Track and monitor Bitcoin addresses for DCA analysis.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="ghost"
                        onClick={handleRefreshAll}
                        disabled={syncingAll || loading}
                        className="rounded-2xl border border-white/10 bg-glass text-white font-semibold hover:bg-primary/10 hover:text-primary py-6 px-8 transition-all"
                    >
                        <RefreshCcw className={cn("w-5 h-5 mr-2", syncingAll ? "animate-spin" : "")} />
                        Refresh All
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => setShowAddForm(true)}
                        className="rounded-2xl shadow-[0_0_20px_rgba(247,147,26,0.1)] py-6 px-8"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        Add Address
                    </Button>
                </div>
            </div>

            {/* Search & Stats */}
            <div className="flex gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                    <input
                        placeholder="Search by name or address..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full bg-glass border border-white/5 rounded-3xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-all"
                    />
                </div>
            </div>

            {/* Wallet List */}
            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="w-10 h-10 text-primary animate-spin" />
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading addresses...</p>
                    </div>
                ) : filteredWallets.length === 0 ? (
                    <Card className="py-20 text-center space-y-4">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-glass border border-white/5 rounded-3xl mb-4">
                            <Bitcoin className="text-gray-700 w-10 h-10" />
                        </div>
                        <p className="text-gray-500 font-medium">No Bitcoin addresses found.</p>
                        <Button variant="outline" onClick={() => setShowAddForm(true)}>Add your first address</Button>
                    </Card>
                ) : (
                    filteredWallets.map(wallet => (
                        <Card key={wallet.id} hover className="flex flex-col md:flex-row items-center justify-between gap-6 py-8">
                            <div className="flex items-center gap-6 w-full md:w-auto">
                                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                                    <Bitcoin className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">{wallet.name}</h3>
                                    <div className="flex items-center gap-2 text-gray-500 font-mono text-sm">
                                        <span>{wallet.address}</span>
                                        <div className="flex gap-2 ml-2">
                                            <a href={`https://mempool.space/address/${wallet.address}`} target="_blank" className="p-1 hover:text-primary transition-colors" title="View on Mempool.space">
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                            <a href={`https://www.blockchain.com/explorer/addresses/btc/${wallet.address}`} target="_blank" className="p-1 hover:text-blue-500 transition-colors" title="View on Blockchain.com">
                                                <Box className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Total Tx Count</p>
                                    <p className="text-xl font-black text-white">{wallet._count?.transactions || 0}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-12 h-12 rounded-2xl bg-glass border border-white/5 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                                        onClick={() => handleSyncWallet(wallet.id)}
                                        disabled={syncing === wallet.id}
                                    >
                                        <RefreshCcw className={cn("w-4 h-4", syncing === wallet.id ? "animate-spin" : "")} />
                                    </Button>
                                    <Button
                                        variant="danger"
                                        size="icon"
                                        className="w-12 h-12 rounded-2xl"
                                        onClick={() => handleDeleteWallet(wallet.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {/* Add Wallet Modal Modal */}
            {showAddForm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-6">
                    <Card className="max-w-xl w-full p-10 space-y-8 animate-in fade-in zoom-in duration-300">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black text-white">Add New <span className="text-primary tracking-tighter">Address</span></h2>
                            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
                        </div>

                        <form onSubmit={handleAddWallet} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Wallet Label</label>
                                <input
                                    required
                                    placeholder="e.g. My Ledger Wallet"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full bg-[#101010] border border-white/5 rounded-2xl p-4 text-white focus:outline-none focus:border-primary transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Bitcoin Address</label>
                                <input
                                    required
                                    placeholder="bc1q..."
                                    value={newAddress}
                                    onChange={(e) => setNewAddress(e.target.value)}
                                    className="w-full bg-[#101010] border border-white/5 rounded-2xl p-4 text-white font-mono text-sm focus:outline-none focus:border-primary transition-all"
                                />
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded-xl flex items-center gap-3">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            <Button
                                variant="primary"
                                size="lg"
                                className="w-full py-6 rounded-2xl"
                                disabled={adding}
                            >
                                {adding ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        Syncing Transactions...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-5 h-5 mr-2" />
                                        Confirm & Start Tracking
                                    </>
                                )}
                            </Button>
                        </form>
                    </Card>
                </div>
            )}
        </DashboardLayout>
    );
}
