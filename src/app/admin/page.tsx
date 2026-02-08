"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, Button, cn } from "@/components/ui/core";
import {
    ShieldCheck,
    Key,
    Smartphone,
    Trash2,
    Plus,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Puzzle,
    ChevronRight
} from "lucide-react";
import axios from 'axios';

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'security' | 'features'>('security');
    const [loading, setLoading] = useState(true);
    const [is2faEnabled, setIs2faEnabled] = useState(false);

    // Setup Flow State
    const [showSetup, setShowSetup] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [token, setToken] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = async () => {
        try {
            const { data } = await axios.get('/api/admin/security');
            setIs2faEnabled(data.enabled);
        } catch (err) {
            console.error('Failed to fetch security status');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleStartSetup = async () => {
        try {
            const { data } = await axios.get('/api/admin/security?action=setup');
            setQrCodeUrl(data.qrCodeUrl);
            setSecret(data.secret);
            setShowSetup(true);
        } catch (err) {
            alert('Failed to initialize 2FA setup');
        }
    };

    const handleVerifyAndEnable = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifying(true);
        setError(null);
        try {
            await axios.post('/api/admin/security', { token, secret });
            setIs2faEnabled(true);
            setShowSetup(false);
            setToken('');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Invalid code');
        } finally {
            setVerifying(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-white mb-2">
                        Admin <span className="gradient-text">Console</span>
                    </h1>
                    <p className="text-gray-500 font-medium tracking-wide">
                        Manage your account security and platform extensions.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-white/5 pb-1">
                {[
                    { id: 'security', name: 'Security & Auth', icon: ShieldCheck },
                    { id: 'features', name: 'Future Features', icon: Puzzle }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            "flex items-center gap-2 px-6 py-4 text-sm font-bold uppercase tracking-widest transition-all relative",
                            activeTab === tab.id ? "text-primary" : "text-gray-500 hover:text-white"
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.name}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'security' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <Card className="flex flex-col md:flex-row items-center justify-between gap-8 p-10">
                        <div className="flex items-center gap-6">
                            <div className={cn(
                                "w-16 h-16 rounded-3xl flex items-center justify-center border transition-all duration-500",
                                is2faEnabled
                                    ? "bg-accent/10 border-accent/20 text-accent shadow-[0_0_30px_rgba(34,197,94,0.1)]"
                                    : "bg-orange-500/10 border-orange-500/20 text-orange-500"
                            )}>
                                <Smartphone className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white">Google Authenticator</h3>
                                <p className="text-gray-500 font-medium max-w-md">
                                    Add an extra layer of security by requiring a verification code from your mobile device when logging in.
                                </p>
                            </div>
                        </div>

                        <div className="w-full md:w-auto">
                            {is2faEnabled ? (
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 text-accent bg-accent/5 px-4 py-2 rounded-2xl border border-accent/10">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-xs font-bold uppercase">Enabled</span>
                                    </div>
                                    <Button variant="danger" size="md">Disable 2FA</Button>
                                </div>
                            ) : (
                                <Button
                                    variant="primary"
                                    size="lg"
                                    onClick={handleStartSetup}
                                    className="rounded-2xl px-10"
                                >
                                    <Plus className="w-5 h-5 mr-2" />
                                    Enable 2FA
                                </Button>
                            )}
                        </div>
                    </Card>

                    <Card className="p-10 space-y-4 opacity-50 grayscale pointer-events-none">
                        <div className="flex items-center gap-4 mb-4">
                            <Key className="w-6 h-6 text-gray-400" />
                            <h3 className="text-xl font-bold text-white tracking-tight">API Key Management</h3>
                        </div>
                        <p className="text-sm text-gray-500 font-medium">Coming soon: Manage your external service API keys and permissions securely from this panel.</p>
                    </Card>
                </div>
            )}

            {activeTab === 'features' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {[
                        { title: 'Automated Reports', desc: 'Schedule weekly PDF reports of your portfolio performance sent directly to your email.' },
                        { title: 'Price Alerts', desc: 'Set custom price triggers and receive instant mobile notifications.' },
                        { title: 'Multi-Asset Support', desc: 'Track Ethereum, Solana, and other top assets in one unified premium dashboard.' },
                        { title: 'Tax Integration', desc: 'Generate FIFO/LIFO tax reports for your crypto transactions with one click.' }
                    ].map((f, i) => (
                        <Card key={i} hover className="p-8 group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                    <Puzzle className="w-6 h-6" />
                                </div>
                                <div className="px-3 py-1 rounded-full bg-glass text-[10px] font-black uppercase tracking-widest text-gray-600">Pending</div>
                            </div>
                            <h3 className="text-xl font-black text-white mb-2">{f.title}</h3>
                            <p className="text-sm text-gray-500 font-medium leading-relaxed mb-6">{f.desc}</p>
                            <div className="flex items-center gap-2 text-primary text-xs font-bold group-hover:translate-x-1 transition-transform cursor-pointer">
                                Vote for this feature <ChevronRight className="w-4 h-4" />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Setup 2FA Modal */}
            {showSetup && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[100] p-6">
                    <Card className="max-w-xl w-full p-10 space-y-8 border-primary/20 animate-in fade-in zoom-in duration-300">
                        <div className="text-center space-y-2">
                            <h2 className="text-3xl font-black text-white">Setup <span className="text-primary tracking-tighter">Security</span></h2>
                            <p className="text-gray-500 font-medium">Scan the QR code with Google Authenticator or Authy.</p>
                        </div>

                        <div className="flex flex-col items-center gap-8">
                            <div className="bg-white p-4 rounded-3xl animate-in zoom-in duration-500 delay-200">
                                {qrCodeUrl && <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />}
                            </div>

                            <div className="w-full space-y-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest text-center mb-4">Manual Entry Key</p>
                                <div className="bg-glass border border-white/5 p-4 rounded-2xl font-mono text-center text-primary font-bold tracking-widest">
                                    {secret}
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleVerifyAndEnable} className="space-y-6 pt-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Verification Code</label>
                                <input
                                    required
                                    placeholder="000 000"
                                    maxLength={6}
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    className="w-full bg-[#101010] border border-white/5 rounded-2xl p-4 text-center text-2xl font-black text-white tracking-[0.5em] focus:outline-none focus:border-primary transition-all"
                                />
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded-xl flex items-center gap-3 animate-in shake duration-300">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-4">
                                <Button variant="ghost" onClick={() => setShowSetup(false)} className="flex-1">Cancel</Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    className="flex-[2] rounded-2xl"
                                    disabled={verifying || token.length < 6}
                                >
                                    {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Enable"}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </DashboardLayout>
    );
}
