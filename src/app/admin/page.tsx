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
    ChevronRight,
    RefreshCw,
    Link2,
    BarChart3
} from "lucide-react";
import axios from 'axios';

interface T212Status {
    configured: boolean;
    environment?: string;
    currency?: string | null;
    lastSyncedAt?: string | null;
    lastSyncError?: string | null;
}

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'security' | 'integrations' | 'features'>('security');
    const [loading, setLoading] = useState(true);
    const [is2faEnabled, setIs2faEnabled] = useState(false);

    // Setup Flow State
    const [showSetup, setShowSetup] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [token, setToken] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // T212 State
    const [t212Status, setT212Status] = useState<T212Status>({ configured: false });
    const [t212Loading, setT212Loading] = useState(true);
    const [t212Syncing, setT212Syncing] = useState(false);
    const [t212Error, setT212Error] = useState<string | null>(null);

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

    const fetchT212Status = async () => {
        try {
            const { data } = await axios.get('/api/t212');
            setT212Status(data);
        } catch (err) {
            console.error('Failed to fetch Trading212 status');
        } finally {
            setT212Loading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchT212Status();
    }, []);

    const handleSyncNow = async () => {
        setT212Syncing(true);
        setT212Error(null);
        try {
            await axios.post('/api/t212/sync');
            await fetchT212Status();
        } catch (err: any) {
            setT212Error(err.response?.data?.error || 'Sync failed');
        } finally {
            setT212Syncing(false);
        }
    };

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
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Admin <span className="gradient-text">Console</span>
                    </h1>
                    <p className="text-muted text-sm">
                        Manage your account security and platform extensions.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-border pb-1">
                {[
                    { id: 'security', name: 'Security & Auth', icon: ShieldCheck },
                    { id: 'integrations', name: 'Integrations', icon: Link2 },
                    { id: 'features', name: 'Future Features', icon: Puzzle }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            "flex items-center gap-2 px-6 py-4 text-sm font-bold uppercase tracking-widest transition-all relative",
                            activeTab === tab.id ? "text-primary" : "text-muted hover:text-foreground"
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
                                "w-16 h-16 rounded-2xl flex items-center justify-center border transition-all duration-500",
                                is2faEnabled
                                    ? "bg-accent/10 border-accent/20 text-accent"
                                    : "bg-orange-500/10 border-orange-500/20 text-orange-500"
                            )}>
                                <Smartphone className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-medium text-foreground">Google Authenticator</h3>
                                <p className="text-muted font-medium max-w-md">
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
                            <Key className="w-6 h-6 text-muted" />
                            <h3 className="text-xl font-bold text-foreground tracking-tight">API Key Management</h3>
                        </div>
                        <p className="text-sm text-muted font-medium">Coming soon: Manage your external service API keys and permissions securely from this panel.</p>
                    </Card>
                </div>
            )}

            {activeTab === 'integrations' && (
                <div className="space-y-6">
                    <Card className="p-6 md:p-8 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center border shrink-0",
                                t212Status.configured
                                    ? "bg-accent/10 border-accent/20 text-accent"
                                    : "bg-white/[0.04] border-border text-muted"
                            )}>
                                <BarChart3 className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-medium text-foreground">Trading 212</h3>
                                <p className="text-muted text-sm">
                                    Import your stocks &amp; ETF investments. Synced automatically every 24 hours.
                                </p>
                            </div>
                        </div>

                        {t212Loading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            </div>
                        ) : !t212Status.configured ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-orange-400 bg-orange-500/5 px-3 py-1.5 rounded-lg border border-orange-500/10 text-xs font-medium uppercase w-fit">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Not configured
                                </div>
                                <p className="text-sm text-muted leading-relaxed max-w-lg">
                                    The API key never goes through this app — add it directly as environment variables
                                    in Vercel, then redeploy: <code className="text-primary">T212_API_KEY</code>,{' '}
                                    <code className="text-primary">T212_API_SECRET</code>, and optionally{' '}
                                    <code className="text-primary">T212_ENVIRONMENT</code> (<code>live</code> or <code>demo</code>, defaults to <code>live</code>).
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2 text-accent bg-accent/5 px-3 py-1.5 rounded-lg border border-accent/10 text-xs font-medium uppercase">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Configured &middot; {t212Status.environment}
                                    </div>
                                    {t212Status.currency && (
                                        <span className="text-xs text-faint">Currency: {t212Status.currency}</span>
                                    )}
                                </div>

                                <div className="text-sm text-muted">
                                    Last synced:{' '}
                                    <span className="text-foreground font-num">
                                        {t212Status.lastSyncedAt
                                            ? new Date(t212Status.lastSyncedAt).toLocaleString()
                                            : 'never yet'}
                                    </span>
                                </div>

                                {t212Status.lastSyncError && (
                                    <div className="bg-red-500/10 border border-red-400/20 text-red-300 text-sm p-3 rounded-lg flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>Last sync failed: {t212Status.lastSyncError}</span>
                                    </div>
                                )}

                                {t212Error && (
                                    <div className="bg-red-500/10 border border-red-400/20 text-red-300 text-sm p-3 rounded-lg">
                                        {t212Error}
                                    </div>
                                )}

                                <Button variant="outline" size="md" onClick={handleSyncNow} disabled={t212Syncing}>
                                    {t212Syncing ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                    )}
                                    Sync now
                                </Button>
                            </div>
                        )}
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
                                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-muted group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                    <Puzzle className="w-6 h-6" />
                                </div>
                                <div className="px-3 py-1 rounded-full bg-glass text-[10px] font-medium uppercase tracking-widest text-faint">Pending</div>
                            </div>
                            <h3 className="text-xl font-medium text-foreground mb-2">{f.title}</h3>
                            <p className="text-sm text-muted font-medium leading-relaxed mb-6">{f.desc}</p>
                            <div className="flex items-center gap-2 text-primary text-xs font-bold group-hover:translate-x-1 transition-transform cursor-pointer">
                                Vote for this feature <ChevronRight className="w-4 h-4" />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Setup 2FA Modal */}
            {showSetup && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
                    <Card className="max-w-xl w-full p-10 space-y-8 border-primary/20 animate-in fade-in zoom-in duration-300">
                        <div className="text-center space-y-2">
                            <h2 className="text-3xl font-medium text-foreground">Setup <span className="text-primary tracking-tighter">Security</span></h2>
                            <p className="text-muted font-medium">Scan the QR code with Google Authenticator or Authy.</p>
                        </div>

                        <div className="flex flex-col items-center gap-8">
                            <div className="bg-white p-4 rounded-2xl animate-in zoom-in duration-500 delay-200">
                                {qrCodeUrl && <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />}
                            </div>

                            <div className="w-full space-y-2">
                                <p className="text-xs font-bold text-muted uppercase tracking-widest text-center mb-4">Manual Entry Key</p>
                                <div className="bg-glass border border-border p-4 rounded-2xl font-mono text-center text-primary font-bold tracking-widest">
                                    {secret}
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleVerifyAndEnable} className="space-y-6 pt-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted ml-1">Verification Code</label>
                                <input
                                    required
                                    placeholder="000 000"
                                    maxLength={6}
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    className="w-full bg-white/[0.03] border border-border rounded-2xl p-4 text-center text-2xl font-medium text-foreground tracking-[0.5em] focus:outline-none focus:border-primary transition-all"
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
