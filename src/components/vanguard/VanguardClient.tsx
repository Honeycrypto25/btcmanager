"use client";

import React, { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, X, Trash2, Pencil, Landmark, Check, TrendingUp, Loader2, List, BarChart3 } from "lucide-react";
import { VanguardSyncButton } from "@/components/vanguard/VanguardSyncButton";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
    createVanguardAccount,
    deleteVanguardAccount,
    createVanguardHolding,
    updateVanguardHoldingValue,
    deleteVanguardHolding,
    getVanguardPriceHistory,
    getVanguardAccountValueHistory,
    type VanguardAccountInput,
    type VanguardHoldingInput,
} from "@/app/actions/vanguard";

const tooltipStyle = { background: "#121210", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 };
const chartAxisProps = { stroke: "#8c8a80", fontSize: 12 };
const ACCOUNT_COLORS = ["#52c98a", "#7aa8d6", "#d6a24c", "#c97ad6", "#d65252", "#5ec9c9"];

type Tab = "list" | "stats";

interface AccountValuePoint {
    date: string;
    value: number;
}

interface AccountValueSeries {
    accountId: string;
    accountName: string;
    points: AccountValuePoint[];
}

interface PricePoint {
    capturedAt: string;
    price: number;
    currency: string;
}

interface HoldingRow {
    id: string;
    fundName: string;
    ticker: string | null;
    units: number | null;
    costBasis: number;
    currentValue: number;
    valueUpdatedAt: string;
}

interface AccountRow {
    id: string;
    name: string;
    accountType: string | null;
    currency: string;
    holdings: HoldingRow[];
}

const inputClass = "w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors";

function formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function VanguardClient({ initialAccounts }: { initialAccounts: AccountRow[] }) {
    const isAdmin = useIsAdmin();
    const [accounts, setAccounts] = useState(initialAccounts);
    const [syncTick, setSyncTick] = useState(0);
    const [tab, setTab] = useState<Tab>("list");
    const [showAccountForm, setShowAccountForm] = useState(false);
    const [accountForm, setAccountForm] = useState<VanguardAccountInput>({ name: "", accountType: "ISA", currency: "GBP" });
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submitAccount() {
        if (!accountForm.name.trim()) {
            setError("Numele contului este obligatoriu.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const created = await createVanguardAccount(accountForm);
                setAccounts((prev) => [...prev, { id: created.id, name: created.name, accountType: created.accountType, currency: created.currency, holdings: [] }]);
                setAccountForm({ name: "", accountType: "ISA", currency: "GBP" });
                setShowAccountForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function removeAccount(id: string) {
        if (!confirm("Ștergi acest cont Vanguard? Se șterg și holdingurile din el.")) return;
        startTransition(async () => {
            await deleteVanguardAccount(id);
            setAccounts((prev) => prev.filter((a) => a.id !== id));
        });
    }

    const totalInvested = accounts.reduce((s, a) => s + a.holdings.reduce((s2, h) => s2 + h.costBasis, 0), 0);
    const totalValue = accounts.reduce((s, a) => s + a.holdings.reduce((s2, h) => s2 + h.currentValue, 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Vanguard</span>
                    </h1>
                    <p className="text-muted text-sm">
                        {accounts.length} conturi · Valoare totală {formatMoney(totalValue, "GBP")} · Investit {formatMoney(totalInvested, "GBP")}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1">
                        {([
                            ["list", "Listă", List],
                            ["stats", "Statistici", BarChart3],
                        ] as const).map(([key, label, Icon]) => (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                                    tab === key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>
                    <VanguardSyncButton onSynced={() => setSyncTick((t) => t + 1)} />
                    {tab === "list" && isAdmin && (
                        <Button variant="primary" onClick={() => setShowAccountForm(!showAccountForm)}>
                            {showAccountForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                            {showAccountForm ? "Anulează" : "Adaugă cont"}
                        </Button>
                    )}
                </div>
            </div>

            {tab === "stats" ? (
                <StatsTab accounts={accounts} />
            ) : (
                <>
                    <Card className="p-4 border-white/10 bg-white/[0.02]">
                        <p className="text-xs text-muted leading-relaxed">
                            Vanguard nu are un API public pentru investitori individuali. Dacă un holding are completate atât
                            Ticker/ISIN cât și Unități, prețul i se actualizează automat o dată pe zi — pentru ETF-uri (ex. VWRL)
                            din prețul de la bursa din Londra, iar pentru fonduri OEIC (ex. &bdquo;FTSE Global All Cap&rdquo;) din
                            ISIN, printr-o sursă publică ce se poate opri fără avertisment dacă își schimbă pagina. Fără ambele
                            câmpuri completate, holdingul rămâne complet manual.
                        </p>
                    </Card>

                    {showAccountForm && (
                        <Card className="p-5 sm:p-6 border-primary/30">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Nume cont</label>
                                    <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="ex. Stocks & Shares ISA" className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Tip</label>
                                    <select value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })} className={inputClass}>
                                        <option value="ISA">ISA</option>
                                        <option value="GIA">GIA</option>
                                        <option value="SIPP">SIPP</option>
                                        <option value="JISA">JISA</option>
                                        <option value="Other">Altul</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Monedă</label>
                                    <input value={accountForm.currency} onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })} className={inputClass} />
                                </div>
                            </div>
                            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                            <div className="flex gap-2 mt-4">
                                <Button variant="primary" onClick={submitAccount} disabled={isPending}>
                                    {isPending ? "Se salvează..." : "Salvează"}
                                </Button>
                            </div>
                        </Card>
                    )}

                    {accounts.length === 0 ? (
                        <Card className="p-16 text-center">
                            <Landmark className="w-6 h-6 mx-auto mb-2 opacity-40 text-faint" />
                            <p className="text-faint italic">Niciun cont Vanguard adăugat încă.</p>
                        </Card>
                    ) : (
                        accounts.map((account) => (
                            <AccountCard key={account.id} account={account} onRemoveAccount={removeAccount} setAccounts={setAccounts} syncTick={syncTick} />
                        ))
                    )}
                </>
            )}
        </div>
    );
}

function StatsTab({ accounts }: { accounts: AccountRow[] }) {
    const [history, setHistory] = useState<AccountValueSeries[] | null>(null);

    useEffect(() => {
        getVanguardAccountValueHistory().then(setHistory);
    }, []);

    const summaries = accounts.map((a) => {
        const invested = a.holdings.reduce((s, h) => s + h.costBasis, 0);
        const value = a.holdings.reduce((s, h) => s + h.currentValue, 0);
        const pnl = value - invested;
        const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
        return { ...a, invested, value, pnl, pnlPercent };
    });

    // Merge all per-account series into one date-indexed dataset for a
    // single multi-line chart (one line per account, sharing an X axis).
    const chartData = React.useMemo(() => {
        if (!history || history.length === 0) return [];
        const dates = Array.from(new Set(history.flatMap((s) => s.points.map((p) => p.date)))).sort();
        return dates.map((date) => {
            const row: Record<string, number | string> = { date, label: format(new Date(date), "dd MMM") };
            for (const series of history) {
                const point = series.points.find((p) => p.date === date);
                if (point) row[series.accountId] = point.value;
            }
            return row;
        });
    }, [history]);

    const hasEnoughForChart = (history?.length ?? 0) > 0 && chartData.length >= 2;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {summaries.map((a) => (
                    <Card key={a.id} className="p-5">
                        <p className="text-sm font-medium text-foreground">{a.name}</p>
                        <p className="text-xs text-muted mb-3">{a.accountType} &middot; {a.currency}</p>
                        <p className="text-xl font-medium font-num text-foreground">{formatMoney(a.value, a.currency)}</p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted">Investit {formatMoney(a.invested, a.currency)}</span>
                            <span className={cn("text-xs font-medium", a.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                ({a.pnl >= 0 ? "+" : ""}{a.pnlPercent.toFixed(1)}%)
                            </span>
                        </div>
                    </Card>
                ))}
            </div>

            <Card className="p-5 sm:p-6">
                <p className="text-sm font-medium text-foreground mb-1">Evoluție valoare pe cont</p>
                <p className="text-xs text-muted mb-4">
                    Construită din istoricul de prețuri (vezi iconița de grafic din tab-ul Listă) — include doar
                    holdingurile cu ticker/ISIN și unități completate.
                </p>
                {history === null ? (
                    <div className="flex items-center gap-2 text-xs text-muted py-10 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă...
                    </div>
                ) : !hasEnoughForChart ? (
                    <p className="text-xs text-faint italic text-center py-10">
                        Nu există încă suficiente date pentru un grafic — ai nevoie de holdinguri cu ticker/ISIN +
                        unități completate, cu cel puțin două prețuri diferite înregistrate în timp.
                    </p>
                ) : (
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" {...chartAxisProps} />
                                <YAxis {...chartAxisProps} tickFormatter={(v) => `£${v}`} width={64} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `£${Number(v).toFixed(2)}`} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                {history!.map((series, i) => (
                                    <Line
                                        key={series.accountId}
                                        type="monotone"
                                        dataKey={series.accountId}
                                        name={series.accountName}
                                        stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        connectNulls
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </Card>
        </div>
    );
}

function AccountCard({ account, onRemoveAccount, setAccounts, syncTick }: { account: AccountRow; onRemoveAccount: (id: string) => void; setAccounts: React.Dispatch<React.SetStateAction<AccountRow[]>>; syncTick: number }) {
    const isAdmin = useIsAdmin();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<VanguardHoldingInput>({ accountId: account.id, fundName: "", costBasis: 0, currentValue: 0 });
    const [editingValueId, setEditingValueId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const [priceHistory, setPriceHistory] = useState<Record<string, PricePoint[]>>({});
    const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});

    function loadHistory(holdingId: string) {
        setHistoryLoading((prev) => ({ ...prev, [holdingId]: true }));
        getVanguardPriceHistory(holdingId)
            .then((points) => setPriceHistory((prev) => ({ ...prev, [holdingId]: points })))
            .finally(() => setHistoryLoading((prev) => ({ ...prev, [holdingId]: false })));
    }

    function toggleHistory(holdingId: string) {
        if (expandedHistoryId === holdingId) {
            setExpandedHistoryId(null);
            return;
        }
        setExpandedHistoryId(holdingId);
        // Always fetch fresh on open rather than trusting a possibly-stale
        // cached result (e.g. a prior open that found "not enough points
        // yet", before a sync since added one).
        loadHistory(holdingId);
    }

    // A sync (manual button or elsewhere) bumps syncTick -- if a history
    // panel happens to be open when that finishes, refresh it in place
    // instead of requiring the user to collapse/reopen to see the new point.
    const isFirstRender = React.useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (expandedHistoryId) loadHistory(expandedHistoryId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncTick]);

    function submitHolding() {
        if (!form.fundName.trim() || !form.costBasis || !form.currentValue) {
            setError("Numele fondului, costul și valoarea curentă sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const created = await createVanguardHolding(form);
                setAccounts((prev) =>
                    prev.map((a) =>
                        a.id === account.id
                            ? { ...a, holdings: [...a.holdings, { id: created.id, fundName: created.fundName, ticker: created.ticker, units: created.units ? Number(created.units) : null, costBasis: Number(created.costBasis), currentValue: Number(created.currentValue), valueUpdatedAt: created.valueUpdatedAt.toISOString() }] }
                            : a
                    )
                );
                setForm({ accountId: account.id, fundName: "", costBasis: 0, currentValue: 0 });
                setShowForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function saveValueUpdate(id: string) {
        const val = parseFloat(editValue);
        if (isNaN(val)) return;
        startTransition(async () => {
            await updateVanguardHoldingValue(id, val);
            setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, holdings: a.holdings.map((h) => (h.id === id ? { ...h, currentValue: val, valueUpdatedAt: new Date().toISOString() } : h)) } : a)));
            setEditingValueId(null);
        });
    }

    function removeHolding(id: string) {
        if (!confirm("Ștergi acest holding?")) return;
        startTransition(async () => {
            await deleteVanguardHolding(id);
            setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, holdings: a.holdings.filter((h) => h.id !== id) } : a)));
        });
    }

    return (
        <Card className="p-0 overflow-hidden border-border">
            <div className="flex items-center justify-between p-5 sm:p-6 hairline-bottom">
                <div>
                    <p className="font-medium text-foreground">{account.name}</p>
                    <p className="text-xs text-muted mt-0.5">{account.accountType} · {account.currency}</p>
                </div>
                {isAdmin && (
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowForm(!showForm)}>
                            {showForm ? <X className="w-3.5 h-3.5 mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                            Holding
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => onRemoveAccount(account.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                )}
            </div>

            {showForm && (
                <div className="p-5 sm:p-6 hairline-bottom bg-white/[0.01]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Fond</label>
                            <input value={form.fundName} onChange={(e) => setForm({ ...form, fundName: e.target.value })} placeholder="ex. FTSE Global All Cap" className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Ticker LSE / ISIN (opțional)</label>
                            <input value={form.ticker || ""} onChange={(e) => setForm({ ...form, ticker: e.target.value })} placeholder="ex. VWRL sau GB00BD3RZ582" className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Unități (opțional)</label>
                            <input type="number" step="0.0001" value={form.units || ""} onChange={(e) => setForm({ ...form, units: parseFloat(e.target.value) || undefined })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Investit (cost total)</label>
                            <input type="number" step="0.01" value={form.costBasis || ""} onChange={(e) => setForm({ ...form, costBasis: parseFloat(e.target.value) || 0 })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Valoare curentă</label>
                            <input type="number" step="0.01" value={form.currentValue || ""} onChange={(e) => setForm({ ...form, currentValue: parseFloat(e.target.value) || 0 })} className={inputClass} />
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                    <div className="flex gap-2 mt-4">
                        <Button variant="primary" size="sm" onClick={submitHolding} disabled={isPending}>
                            {isPending ? "Se salvează..." : "Salvează"}
                        </Button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border bg-white/[0.02]">
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Fond</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Investit</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Valoare curentă</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Actualizat</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {account.holdings.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-10 text-center text-faint italic text-sm">Niciun holding în acest cont.</td></tr>
                        ) : (
                            account.holdings.map((h) => {
                                const pnl = h.currentValue - h.costBasis;
                                const pnlPercent = h.costBasis > 0 ? (pnl / h.costBasis) * 100 : 0;
                                const isExpanded = expandedHistoryId === h.id;
                                return (
                                    <React.Fragment key={h.id}>
                                        <tr className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-6 py-4 text-sm text-foreground">
                                                {h.fundName} {h.ticker && <span className="text-faint">({h.ticker})</span>}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-muted">{formatMoney(h.costBasis, account.currency)}</td>
                                            <td className="px-6 py-4 text-sm">
                                                {editingValueId === h.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <input type="number" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-24 bg-white/[0.06] border border-border rounded-lg px-2 py-1 text-sm text-foreground" autoFocus />
                                                        <button onClick={() => saveValueUpdate(h.id)} className="p-1 rounded text-green-400 hover:bg-green-500/10"><Check className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => setEditingValueId(null)} className="p-1 rounded text-muted hover:bg-white/5"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-foreground">{formatMoney(h.currentValue, account.currency)}</span>
                                                        <span className={cn("text-xs", pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                                            ({pnl >= 0 ? "+" : ""}{pnlPercent.toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-muted">{format(new Date(h.valueUpdatedAt), "dd MMM yyyy")}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {h.ticker && (
                                                        <button onClick={() => toggleHistory(h.id)} title="Istoric preț" className={cn("p-1.5 rounded-lg hover:bg-white/5", isExpanded ? "text-primary" : "text-muted hover:text-primary")}>
                                                            <TrendingUp className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <>
                                                            <button onClick={() => { setEditingValueId(h.id); setEditValue(String(h.currentValue)); }} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => removeHolding(h.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={5} className="px-6 py-4">
                                                    {historyLoading[h.id] ? (
                                                        <div className="flex items-center gap-2 text-xs text-muted py-6 justify-center">
                                                            <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă istoricul...
                                                        </div>
                                                    ) : (priceHistory[h.id]?.length ?? 0) === 0 ? (
                                                        <p className="text-xs text-faint italic text-center py-6">
                                                            Niciun preț înregistrat încă — apasă &bdquo;Sincronizează prețuri&rdquo; ca să prindem primul.
                                                        </p>
                                                    ) : (priceHistory[h.id]?.length ?? 0) === 1 ? (
                                                        <div className="text-center py-6">
                                                            <p className="text-xl font-medium font-num text-foreground">
                                                                £{priceHistory[h.id]![0].price.toFixed(4)}
                                                            </p>
                                                            <p className="text-xs text-faint mt-1">
                                                                Primul preț înregistrat &middot; {format(new Date(priceHistory[h.id]![0].capturedAt), "dd MMM yyyy, HH:mm")}
                                                            </p>
                                                            <p className="text-[11px] text-faint mt-2">
                                                                Graficul apare de la al doilea preț diferit — un fond OEIC ca acesta are un singur preț NAV pe zi, deci poate dura o zi sau mai multe.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="h-[160px]">
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <LineChart data={priceHistory[h.id]!.map((p) => ({ ...p, label: format(new Date(p.capturedAt), "dd MMM") }))}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                                    <XAxis dataKey="label" {...chartAxisProps} />
                                                                    <YAxis {...chartAxisProps} domain={["auto", "auto"]} tickFormatter={(v) => `£${v}`} width={64} />
                                                                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `£${Number(v).toFixed(2)}`} />
                                                                    <Line type="monotone" dataKey="price" stroke="#52c98a" strokeWidth={2} dot={{ r: 3 }} />
                                                                </LineChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
