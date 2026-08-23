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
    BarChart3,
    Mail,
    Send,
    Users,
    UserX,
    History,
    XCircle,
    Package
} from "lucide-react";
import axios from 'axios';
import { listEmailLogs, type EmailLogRow } from "@/app/actions/email-log";

interface DependencyRow {
    name: string;
    type: 'dependency' | 'devDependency';
    current: string;
    latest: string | null;
    behind: 'patch' | 'minor' | 'major' | null;
}

interface T212Status {
    configured: boolean;
    environment?: string;
    currency?: string | null;
    lastSyncedAt?: string | null;
    lastSyncError?: string | null;
}

interface ReportsStatus {
    configured: boolean;
    hasApiKey: boolean;
    recipient: string | null;
}

interface ViewerAccessRow {
    id: string;
    email: string;
    label: string | null;
    sections: string[];
}

// Kept in sync by hand with SECTION_KEYS/SECTION_LABELS in
// src/lib/permissions.ts — that module also exports server-only helpers
// (getServerSession/authOptions), so it can't be imported into this
// client component without pulling Node-only code into the browser bundle.
const SECTION_OPTIONS: { key: string; label: string }[] = [
    { key: 'btc', label: 'Bitcoin' },
    { key: 't212', label: 'Trading 212' },
    { key: 'investments', label: 'Investiții (Vanguard, Goals)' },
    { key: 'solana', label: 'Solana DCA' },
    { key: 'base', label: 'Base (ETH) DCA' },
    { key: 'bnb', label: 'BNB Chain DCA' },
    { key: 'selfEmployed', label: 'Self Employed / Taxe' },
    { key: 'vehicles', label: 'Vehicule & Documente' },
];

const CHAIN_COLORS: Record<string, string> = {
    'Solana': '#9945FF',
    'Base (ETH)': '#0052FF',
    'BNB Chain': '#F0B90B',
};

const EMAIL_TRIGGERS: { label: string; description: string; color: string }[] = [
    { label: 'Ordin plasat — Solana', description: 'Trimis după ce ordinul limit de vânzare e plasat (nu la simpla cumpărare).', color: CHAIN_COLORS['Solana'] },
    { label: 'Ordin finalizat — Solana', description: 'Trimis când ordinul limit se umple (fill).', color: CHAIN_COLORS['Solana'] },
    { label: 'Retragere — Solana', description: 'Trimis la fiecare sweep către cold wallet.', color: CHAIN_COLORS['Solana'] },
    { label: 'Ordin plasat — Base (ETH)', description: 'Trimis după ce ordinul limit de vânzare e plasat.', color: CHAIN_COLORS['Base (ETH)'] },
    { label: 'Ordin finalizat — Base (ETH)', description: 'Trimis când ordinul limit se umple (fill).', color: CHAIN_COLORS['Base (ETH)'] },
    { label: 'Retragere — Base (ETH)', description: 'Trimis la fiecare sweep către cold wallet.', color: CHAIN_COLORS['Base (ETH)'] },
    { label: 'Ordin plasat — BNB Chain', description: 'Trimis după ce ordinul limit de vânzare e plasat.', color: CHAIN_COLORS['BNB Chain'] },
    { label: 'Ordin finalizat — BNB Chain', description: 'Trimis când ordinul limit se umple (fill).', color: CHAIN_COLORS['BNB Chain'] },
    { label: 'Retragere — BNB Chain', description: 'Trimis la fiecare sweep către cold wallet.', color: CHAIN_COLORS['BNB Chain'] },
    { label: 'Raport săptămânal', description: 'Rezumat portofoliu, luni dimineața.', color: '#8A8F98' },
    { label: 'Raport lunar', description: 'Recapitulare lunară, pe 1 ale lunii.', color: '#8A8F98' },
];

const EMAIL_TYPE_LABELS: Record<string, string> = {
    ORDER_PLACED: 'Ordin plasat',
    ORDER_FILLED: 'Ordin finalizat',
    SWEEP: 'Retragere',
    WEEKLY_REPORT: 'Raport săptămânal',
    MONTHLY_REPORT: 'Raport lunar',
};

export default function AdminPageClient() {
    const [activeTab, setActiveTab] = useState<'security' | 'access' | 'integrations' | 'reports' | 'dependencies' | 'features'>('security');
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

    // Reports State
    const [reportsStatus, setReportsStatus] = useState<ReportsStatus>({ configured: false, hasApiKey: false, recipient: null });
    const [reportsLoading, setReportsLoading] = useState(true);
    const [sendingReport, setSendingReport] = useState<'weekly' | 'monthly' | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);
    const [reportSuccess, setReportSuccess] = useState<string | null>(null);

    // Email History State
    const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
    const [emailLogsLoading, setEmailLogsLoading] = useState(true);
    const [emailLogsError, setEmailLogsError] = useState<string | null>(null);

    // Viewer Access State
    const [viewers, setViewers] = useState<ViewerAccessRow[]>([]);
    const [viewersLoading, setViewersLoading] = useState(true);
    const [viewerEmail, setViewerEmail] = useState('');
    const [viewerLabel, setViewerLabel] = useState('');
    const [viewerSections, setViewerSections] = useState<string[]>([]);
    const [viewerSaving, setViewerSaving] = useState(false);
    const [viewerError, setViewerError] = useState<string | null>(null);
    const [editingViewerId, setEditingViewerId] = useState<string | null>(null);

    // Dependencies State — lazy-loaded only when the tab is first opened
    // (42 npm registry lookups on every page load would be wasteful).
    const [depRows, setDepRows] = useState<DependencyRow[]>([]);
    const [depLoading, setDepLoading] = useState(false);
    const [depLoaded, setDepLoaded] = useState(false);
    const [depError, setDepError] = useState<string | null>(null);

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

    const fetchReportsStatus = async () => {
        try {
            const { data } = await axios.get('/api/reports/send');
            setReportsStatus(data);
        } catch (err) {
            console.error('Failed to fetch reports status');
        } finally {
            setReportsLoading(false);
        }
    };

    const fetchEmailLogs = async () => {
        setEmailLogsError(null);
        try {
            const rows = await listEmailLogs(200);
            setEmailLogs(rows);
        } catch (err) {
            console.error('Failed to fetch email logs', err);
            setEmailLogsError('Nu am putut încărca istoricul emailurilor.');
        } finally {
            setEmailLogsLoading(false);
        }
    };

    const fetchViewers = async () => {
        try {
            const { data } = await axios.get('/api/admin/viewers');
            setViewers(data);
        } catch (err) {
            console.error('Failed to fetch viewers');
        } finally {
            setViewersLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchT212Status();
        fetchReportsStatus();
        fetchEmailLogs();
        fetchViewers();
    }, []);

    const fetchDependencies = async () => {
        setDepLoading(true);
        setDepError(null);
        try {
            const { data } = await axios.get('/api/admin/dependencies');
            setDepRows(data);
            setDepLoaded(true);
        } catch (err) {
            console.error('Failed to fetch dependency status', err);
            setDepError('Nu am putut verifica versiunile — încearcă din nou.');
        } finally {
            setDepLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'dependencies' && !depLoaded && !depLoading) {
            fetchDependencies();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const toggleViewerSection = (key: string) => {
        setViewerSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const startEditViewer = (viewer: ViewerAccessRow) => {
        setEditingViewerId(viewer.id);
        setViewerEmail(viewer.email);
        setViewerLabel(viewer.label ?? '');
        setViewerSections(viewer.sections);
        setViewerError(null);
    };

    const resetViewerForm = () => {
        setEditingViewerId(null);
        setViewerEmail('');
        setViewerLabel('');
        setViewerSections([]);
        setViewerError(null);
    };

    const handleSaveViewer = async () => {
        setViewerError(null);
        if (!viewerEmail.trim()) {
            setViewerError('Introdu o adresă de email.');
            return;
        }
        if (viewerSections.length === 0) {
            setViewerError('Bifează cel puțin o secțiune.');
            return;
        }
        setViewerSaving(true);
        try {
            await axios.post('/api/admin/viewers', {
                email: viewerEmail.trim(),
                label: viewerLabel.trim() || null,
                sections: viewerSections,
            });
            resetViewerForm();
            await fetchViewers();
        } catch (err: any) {
            setViewerError(err?.response?.data?.error || 'Nu am putut salva accesul.');
        } finally {
            setViewerSaving(false);
        }
    };

    const handleDeleteViewer = async (id: string) => {
        if (!confirm('Sigur revoci accesul acestei persoane?')) return;
        try {
            await axios.delete(`/api/admin/viewers?id=${id}`);
            await fetchViewers();
            if (editingViewerId === id) resetViewerForm();
        } catch (err) {
            console.error('Failed to delete viewer');
        }
    };

    const handleSendReport = async (type: 'weekly' | 'monthly') => {
        setSendingReport(type);
        setReportError(null);
        setReportSuccess(null);
        try {
            await axios.post('/api/reports/send', { type });
            setReportSuccess(`${type === 'weekly' ? 'Weekly' : 'Monthly'} report sent to ${reportsStatus.recipient}.`);
        } catch (err: any) {
            setReportError(err.response?.data?.error || 'Failed to send report');
        } finally {
            setSendingReport(null);
        }
    };

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
                    { id: 'access', name: 'Acces vizualizare', icon: Users },
                    { id: 'integrations', name: 'Integrations', icon: Link2 },
                    { id: 'reports', name: 'Reports', icon: Mail },
                    { id: 'dependencies', name: 'Dependențe', icon: Package },
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

            {activeTab === 'access' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <Card className="p-6 md:p-8 space-y-6">
                        <div>
                            <h3 className="text-xl font-bold text-foreground tracking-tight mb-1">
                                {editingViewerId ? 'Editează accesul' : 'Adaugă acces de vizualizare'}
                            </h3>
                            <p className="text-sm text-muted font-medium">
                                Persoana adăugată aici (ex. soția sau un prieten) se poate autentifica cu emailul ei
                                și primește un cod OTP, dar vede doar secțiunile bifate mai jos — și nu poate
                                modifica, șterge sau declanșa nimic, indiferent de secțiune.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted">Email</label>
                                <input
                                    type="email"
                                    value={viewerEmail}
                                    onChange={(e) => setViewerEmail(e.target.value)}
                                    placeholder="sotia@example.com"
                                    className="w-full rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/40"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted">Nume (opțional)</label>
                                <input
                                    type="text"
                                    value={viewerLabel}
                                    onChange={(e) => setViewerLabel(e.target.value)}
                                    placeholder="Soția"
                                    className="w-full rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/40"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted">Ce poate vedea</label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {SECTION_OPTIONS.map(opt => (
                                    <label
                                        key={opt.key}
                                        className={cn(
                                            "flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm cursor-pointer transition-colors",
                                            viewerSections.includes(opt.key)
                                                ? "border-primary/40 bg-primary/5 text-foreground"
                                                : "border-border text-muted hover:text-foreground"
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={viewerSections.includes(opt.key)}
                                            onChange={() => toggleViewerSection(opt.key)}
                                            className="accent-primary"
                                        />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {viewerError && (
                            <div className="flex items-center gap-2 text-sm text-red-400">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {viewerError}
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            <Button variant="primary" onClick={handleSaveViewer} disabled={viewerSaving}>
                                {viewerSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                {editingViewerId ? 'Salvează' : 'Adaugă acces'}
                            </Button>
                            {editingViewerId && (
                                <Button variant="secondary" onClick={resetViewerForm}>Anulează</Button>
                            )}
                        </div>
                    </Card>

                    <Card className="p-6 md:p-8 space-y-4">
                        <h3 className="text-xl font-bold text-foreground tracking-tight">Persoane cu acces</h3>
                        {viewersLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Se încarcă...</div>
                        ) : viewers.length === 0 ? (
                            <p className="text-sm text-muted">Nimeni nu are acces de vizualizare încă.</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {viewers.map(viewer => (
                                    <div key={viewer.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="font-medium text-foreground">
                                                {viewer.label ? `${viewer.label} — ` : ''}{viewer.email}
                                            </p>
                                            <p className="text-xs text-muted mt-0.5">
                                                {viewer.sections.map(s => SECTION_OPTIONS.find(o => o.key === s)?.label ?? s).join(', ')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Button variant="secondary" size="sm" onClick={() => startEditViewer(viewer)}>Editează</Button>
                                            <Button variant="danger" size="sm" onClick={() => handleDeleteViewer(viewer.id)}>
                                                <UserX className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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

            {activeTab === 'reports' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <Card className="p-6 md:p-8 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center border shrink-0",
                                reportsStatus.configured
                                    ? "bg-accent/10 border-accent/20 text-accent"
                                    : "bg-white/[0.04] border-border text-muted"
                            )}>
                                <Mail className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-medium text-foreground">Email reports</h3>
                                <p className="text-muted text-sm">
                                    A weekly summary every Monday morning, and a monthly recap on the 1st of each month.
                                </p>
                            </div>
                        </div>

                        {reportsLoading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            </div>
                        ) : !reportsStatus.configured ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-orange-400 bg-orange-500/5 px-3 py-1.5 rounded-lg border border-orange-500/10 text-xs font-medium uppercase w-fit">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Not configured
                                </div>
                                <p className="text-sm text-muted leading-relaxed max-w-lg">
                                    Add these as environment variables in Vercel, then redeploy:{' '}
                                    <code className="text-primary">RESEND_API_KEY</code> (from your Resend account),{' '}
                                    <code className="text-primary">REPORT_EMAIL_TO</code> (where reports get sent), and optionally{' '}
                                    <code className="text-primary">REPORT_EMAIL_FROM</code> (must be on a domain verified in Resend —
                                    defaults to <code>reports@evama.net</code>).
                                </p>
                                {reportsStatus.hasApiKey && (
                                    <p className="text-xs text-faint">Resend API key is set — just missing REPORT_EMAIL_TO.</p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2 text-accent bg-accent/5 px-3 py-1.5 rounded-lg border border-accent/10 text-xs font-medium uppercase">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Configured
                                    </div>
                                    <span className="text-xs text-faint">Sends to: {reportsStatus.recipient}</span>
                                </div>

                                {reportSuccess && (
                                    <div className="bg-accent/10 border border-accent/20 text-accent text-sm p-3 rounded-lg">
                                        {reportSuccess}
                                    </div>
                                )}
                                {reportError && (
                                    <div className="bg-red-500/10 border border-red-400/20 text-red-300 text-sm p-3 rounded-lg">
                                        {reportError}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-3">
                                    <Button variant="outline" size="md" onClick={() => handleSendReport('weekly')} disabled={sendingReport !== null}>
                                        {sendingReport === 'weekly' ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <Send className="w-4 h-4 mr-2" />
                                        )}
                                        Send test weekly report
                                    </Button>
                                    <Button variant="outline" size="md" onClick={() => handleSendReport('monthly')} disabled={sendingReport !== null}>
                                        {sendingReport === 'monthly' ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <Send className="w-4 h-4 mr-2" />
                                        )}
                                        Send test monthly report
                                    </Button>
                                </div>
                                <p className="text-[10px] text-faint leading-relaxed">
                                    Scheduled sends run automatically — Mondays at ~7am UTC (weekly) and the 1st of the month at
                                    ~7am UTC (monthly). These buttons just send an on-demand copy so you can preview the design.
                                </p>
                            </div>
                        )}
                    </Card>

                    <Card className="p-6 md:p-8 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 bg-white/[0.04] border-border text-muted">
                                <Send className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-medium text-foreground">Configured emails</h3>
                                <p className="text-muted text-sm">
                                    These are sent automatically, in addition to the weekly/monthly reports above.
                                </p>
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            {EMAIL_TRIGGERS.map((trigger) => (
                                <div key={trigger.label} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-border">
                                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: trigger.color }} />
                                    <div className="min-w-0">
                                        <p className="text-sm text-foreground font-medium">{trigger.label}</p>
                                        <p className="text-xs text-faint leading-relaxed">{trigger.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="p-6 md:p-8 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 bg-white/[0.04] border-border text-muted">
                                <History className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-medium text-foreground">Email history</h3>
                                <p className="text-muted text-sm">
                                    Last {emailLogs.length} email{emailLogs.length === 1 ? '' : 's'} sent or attempted.
                                </p>
                            </div>
                            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={fetchEmailLogs} disabled={emailLogsLoading}>
                                <RefreshCw className={cn("w-4 h-4", emailLogsLoading && "animate-spin")} />
                            </Button>
                        </div>

                        {emailLogsLoading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            </div>
                        ) : emailLogsError ? (
                            <div className="bg-red-500/10 border border-red-400/20 text-red-300 text-sm p-3 rounded-lg">
                                {emailLogsError}
                            </div>
                        ) : emailLogs.length === 0 ? (
                            <p className="text-sm text-muted">Niciun email trimis încă.</p>
                        ) : (
                            <div className="overflow-x-auto -mx-6 md:-mx-8">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-faint uppercase border-b border-border">
                                            <th className="px-6 md:px-8 py-2 font-medium whitespace-nowrap">Data</th>
                                            <th className="px-3 py-2 font-medium whitespace-nowrap">Tip</th>
                                            <th className="px-3 py-2 font-medium whitespace-nowrap">Chain</th>
                                            <th className="px-3 py-2 font-medium">Subiect</th>
                                            <th className="px-3 py-2 font-medium whitespace-nowrap">Destinatar</th>
                                            <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {emailLogs.map((log) => (
                                            <tr key={log.id} className="border-b border-border/50 last:border-0 align-top">
                                                <td className="px-6 md:px-8 py-2.5 whitespace-nowrap text-faint text-xs">
                                                    {new Date(log.createdAt).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                                                    {EMAIL_TYPE_LABELS[log.type] ?? log.type}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-muted">{log.chain ?? '—'}</td>
                                                <td className="px-3 py-2.5 text-muted max-w-xs truncate" title={log.subject}>{log.subject}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-muted">{log.recipient}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    {log.status === 'SENT' ? (
                                                        <span className="inline-flex items-center gap-1.5 text-accent text-xs font-medium">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Trimis
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className="inline-flex items-center gap-1.5 text-red-400 text-xs font-medium"
                                                            title={log.errorMessage ?? undefined}
                                                        >
                                                            <XCircle className="w-3.5 h-3.5" /> Eșuat
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {activeTab === 'dependencies' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <Card className="p-6 md:p-8 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 bg-white/[0.04] border-border text-muted">
                                <Package className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-medium text-foreground">Dependențe (package.json)</h3>
                                <p className="text-muted text-sm">
                                    Versiunea folosită acum vs. ultima versiune publicată pe npm, pentru fiecare pachet. Nu actualizează nimic automat — doar arată ce ar merita verificat.
                                </p>
                            </div>
                            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={fetchDependencies} disabled={depLoading}>
                                <RefreshCw className={cn("w-4 h-4", depLoading && "animate-spin")} />
                            </Button>
                        </div>

                        {depLoading && depRows.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
                                <Loader2 className="w-5 h-5 animate-spin" /> Se verifică pe npm — poate dura câteva secunde...
                            </div>
                        ) : depError ? (
                            <div className="bg-red-500/10 border border-red-400/20 text-red-300 text-sm p-3 rounded-lg">
                                {depError}
                            </div>
                        ) : depRows.length === 0 ? (
                            <p className="text-sm text-muted">Apasă refresh ca să verifici versiunile.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <span className="inline-flex items-center gap-1.5 text-red-400"><span className="w-2 h-2 rounded-full bg-red-400" /> Major în urmă</span>
                                    <span className="inline-flex items-center gap-1.5 text-orange-400"><span className="w-2 h-2 rounded-full bg-orange-400" /> Minor în urmă</span>
                                    <span className="inline-flex items-center gap-1.5 text-yellow-400"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Patch în urmă</span>
                                    <span className="inline-flex items-center gap-1.5 text-accent"><span className="w-2 h-2 rounded-full bg-accent" /> La zi</span>
                                    <span className="inline-flex items-center gap-1.5 text-faint"><span className="w-2 h-2 rounded-full bg-faint" /> Necunoscut (lookup eșuat)</span>
                                </div>
                                <div className="overflow-x-auto -mx-6 md:-mx-8">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs text-faint uppercase border-b border-border">
                                                <th className="px-6 md:px-8 py-2 font-medium">Pachet</th>
                                                <th className="px-3 py-2 font-medium whitespace-nowrap">Tip</th>
                                                <th className="px-3 py-2 font-medium whitespace-nowrap">Versiune curentă</th>
                                                <th className="px-3 py-2 font-medium whitespace-nowrap">Ultima pe npm</th>
                                                <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {depRows.map((dep) => {
                                                const statusColor =
                                                    dep.behind === 'major' ? 'text-red-400' :
                                                    dep.behind === 'minor' ? 'text-orange-400' :
                                                    dep.behind === 'patch' ? 'text-yellow-400' :
                                                    dep.latest ? 'text-accent' : 'text-faint';
                                                const statusLabel =
                                                    dep.behind === 'major' ? 'Major în urmă' :
                                                    dep.behind === 'minor' ? 'Minor în urmă' :
                                                    dep.behind === 'patch' ? 'Patch în urmă' :
                                                    dep.latest ? 'La zi' : 'Necunoscut';
                                                return (
                                                    <tr key={dep.name} className="border-b border-border/50 last:border-0">
                                                        <td className="px-6 md:px-8 py-2.5 whitespace-nowrap text-foreground font-mono text-xs">{dep.name}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-muted text-xs">{dep.type === 'devDependency' ? 'dev' : 'prod'}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-muted font-num">{dep.current}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-foreground font-num">{dep.latest ?? '—'}</td>
                                                        <td className={cn("px-3 py-2.5 whitespace-nowrap text-xs font-medium", statusColor)}>{statusLabel}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </Card>
                </div>
            )}

            {activeTab === 'features' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {[
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
