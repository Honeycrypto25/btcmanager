"use client";

import React, { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, X, Trash2, Pencil, Landmark, Check, TrendingUp, Loader2, List, BarChart3, History, User } from "lucide-react";
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
    addVanguardContribution,
    deleteVanguardContribution,
    getVanguardContributions,
    getVanguardHoldingSignals,
    type VanguardAccountInput,
    type VanguardHoldingInput,
    type VanguardContributionInput,
    type VanguardHoldingSignal,
} from "@/app/actions/vanguard";

const OWNER_OPTIONS: { value: string; label: string }[] = [
    { value: "self", label: "Eu" },
    { value: "spouse", label: "Soție" },
    { value: "child", label: "Copil" },
    { value: "other", label: "Altul" },
];

function ownerBadgeLabel(owner: string | undefined, ownerLabel: string | null | undefined): string {
    const preset = OWNER_OPTIONS.find((o) => o.value === owner);
    if (owner === "child" || owner === "other") {
        return ownerLabel?.trim() ? ownerLabel : (preset?.label ?? "Altul");
    }
    return preset?.label ?? "Eu";
}

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
    owner: string;
    ownerLabel: string | null;
    holdings: HoldingRow[];
}

interface ContributionRow {
    id: string;
    date: string;
    units: number;
    amount: number;
    notes: string | null;
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
    const [accountForm, setAccountForm] = useState<VanguardAccountInput>({ name: "", accountType: "ISA", currency: "GBP", owner: "self", ownerLabel: "" });
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
                setAccounts((prev) => [...prev, { id: created.id, name: created.name, accountType: created.accountType, currency: created.currency, owner: created.owner, ownerLabel: created.ownerLabel, holdings: [] }]);
                setAccountForm({ name: "", accountType: "ISA", currency: "GBP", owner: "self", ownerLabel: "" });
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
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Proprietar</label>
                                    <select value={accountForm.owner} onChange={(e) => setAccountForm({ ...accountForm, owner: e.target.value })} className={inputClass}>
                                        {OWNER_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                {(accountForm.owner === "child" || accountForm.owner === "other") && (
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted">{accountForm.owner === "child" ? "Numele copilului" : "Etichetă"}</label>
                                        <input value={accountForm.ownerLabel || ""} onChange={(e) => setAccountForm({ ...accountForm, ownerLabel: e.target.value })} placeholder={accountForm.owner === "child" ? "ex. Maria" : "ex. Cumnat-su"} className={inputClass} />
                                    </div>
                                )}
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
    const [signals, setSignals] = useState<VanguardHoldingSignal[] | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
    const [periodMode, setPeriodMode] = useState<"monthly" | "yearly">("monthly");

    useEffect(() => {
        getVanguardAccountValueHistory().then(setHistory);
        getVanguardHoldingSignals().then(setSignals);
    }, []);

    const signalByHoldingId = React.useMemo(() => {
        const map = new Map<string, VanguardHoldingSignal>();
        for (const sig of signals ?? []) map.set(sig.holdingId, sig);
        return map;
    }, [signals]);

    // A signal needs a handful of distinct daily prices captured over the
    // trailing 3 months before it's trustworthy -- a fresh ticker/ISIN
    // might only have 1-2 points so far, which isn't a real "average".
    const MIN_SIGNAL_SAMPLES = 5;

    const visibleAccounts = selectedAccountId === "all" ? accounts : accounts.filter((a) => a.id === selectedAccountId);

    const summaries = visibleAccounts.map((a) => {
        const invested = a.holdings.reduce((s, h) => s + h.costBasis, 0);
        const value = a.holdings.reduce((s, h) => s + h.currentValue, 0);
        const pnl = value - invested;
        const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
        return { ...a, invested, value, pnl, pnlPercent };
    });

    const visibleHistory = history?.filter((s) => selectedAccountId === "all" || s.accountId === selectedAccountId) ?? null;

    // Merge all per-account series into one date-indexed dataset for a
    // single multi-line chart (one line per account, sharing an X axis).
    const chartData = React.useMemo(() => {
        if (!visibleHistory || visibleHistory.length === 0) return [];
        const dates = Array.from(new Set(visibleHistory.flatMap((s) => s.points.map((p) => p.date)))).sort();
        return dates.map((date) => {
            const row: Record<string, number | string> = { date, label: format(new Date(date), "dd MMM") };
            for (const series of visibleHistory) {
                const point = series.points.find((p) => p.date === date);
                if (point) row[series.accountId] = point.value;
            }
            return row;
        });
    }, [visibleHistory]);

    const hasEnoughForChart = (visibleHistory?.length ?? 0) > 0 && chartData.length >= 2;

    // Portfolio-wide (or single-account, when filtered) value series,
    // forward-filled across every date so summing accounts doesn't dip to
    // zero on days where only some of them have a price point -- this is
    // what the monthly/yearly profitability chart below buckets into
    // periods. Same best-effort convention as the rest of this page: units
    // are treated as constant at their current amount, since there's no
    // historical "units held on date X" record.
    const totalSeries = React.useMemo(() => {
        if (!visibleHistory || visibleHistory.length === 0) return [];
        const dates = Array.from(new Set(visibleHistory.flatMap((s) => s.points.map((p) => p.date)))).sort();
        const lastKnown: Record<string, number> = {};
        return dates.map((date) => {
            let total = 0;
            for (const series of visibleHistory) {
                const point = series.points.find((p) => p.date === date);
                if (point) lastKnown[series.accountId] = point.value;
                if (lastKnown[series.accountId] !== undefined) total += lastKnown[series.accountId];
            }
            return { date, value: total };
        });
    }, [visibleHistory]);

    // Buckets totalSeries into calendar months or years and turns each
    // period into a % return vs. the period before it (last known value of
    // the prior period → last known value of this period). The very first
    // period a series appears in has no prior reference, so it's shown as
    // 0% (a start marker, not a real move).
    const profitabilityData = React.useMemo(() => {
        if (totalSeries.length === 0) return [];
        const keyOf = (date: string) => (periodMode === "monthly" ? date.slice(0, 7) : date.slice(0, 4));
        const labelOf = (key: string) =>
            periodMode === "monthly" ? format(new Date(`${key}-01`), "MMM yyyy") : key;

        const lastValueByPeriod = new Map<string, number>();
        for (const point of totalSeries) {
            lastValueByPeriod.set(keyOf(point.date), point.value);
        }
        const periods = Array.from(lastValueByPeriod.keys()).sort();
        let prevValue: number | null = null;
        return periods.map((key) => {
            const value = lastValueByPeriod.get(key)!;
            const returnPercent = prevValue && prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : 0;
            prevValue = value;
            return { period: key, label: labelOf(key), returnPercent };
        });
    }, [totalSeries, periodMode]);

    // Average entry price per holding (cost basis ÷ units), vs. an implied
    // "current price" derived the same way from currentValue ÷ units --
    // there's no separate live price field for manual holdings, so this is
    // consistent with what's already shown elsewhere on the page. Only
    // holdings with units > 0 have a meaningful price at all.
    const holdingsWithPrice = visibleAccounts.flatMap((a) =>
        a.holdings
            .filter((h) => h.units !== null && h.units > 0)
            .map((h) => {
                const avgPrice = h.costBasis / (h.units as number);
                const currentPrice = h.currentValue / (h.units as number);
                const diffPercent = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;

                const sig = signalByHoldingId.get(h.id);
                const hasSignal = !!sig && sig.avg3mPrice !== null && sig.avg3mSampleSize >= MIN_SIGNAL_SAMPLES;
                const avg3mPrice = hasSignal ? (sig!.avg3mPrice as number) : null;
                const signalCurrentPrice = sig?.currentPrice ?? currentPrice;
                const vsAvg3mPercent = hasSignal ? ((signalCurrentPrice - avg3mPrice!) / avg3mPrice!) * 100 : null;
                const isBuySignal = hasSignal && signalCurrentPrice <= (avg3mPrice as number);

                return {
                    holdingId: h.id,
                    fundName: h.fundName,
                    ticker: h.ticker,
                    accountName: a.name,
                    currency: a.currency,
                    units: h.units as number,
                    avgPrice,
                    currentPrice,
                    diffPercent,
                    avg3mPrice,
                    vsAvg3mPercent,
                    isBuySignal,
                    hasSignal,
                };
            })
    );

    return (
        <div className="space-y-6">
            {accounts.length > 1 && (
                <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1 overflow-x-auto w-fit max-w-full">
                    <button
                        onClick={() => setSelectedAccountId("all")}
                        className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                            selectedAccountId === "all" ? "bg-primary text-black" : "text-muted hover:text-foreground"
                        )}
                    >
                        Toate conturile
                    </button>
                    {accounts.map((a) => (
                        <button
                            key={a.id}
                            onClick={() => setSelectedAccountId(a.id)}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                                selectedAccountId === a.id ? "bg-primary text-black" : "text-muted hover:text-foreground"
                            )}
                        >
                            {a.name}
                        </button>
                    ))}
                </div>
            )}

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
                <p className="text-sm font-medium text-foreground mb-1">Preț mediu de intrare</p>
                <p className="text-xs text-muted mb-4">
                    Preț mediu = total investit ÷ unități deținute, pe fiecare holding — se recalculează automat
                    la fiecare contribuție nouă. Prețul curent e derivat din valoarea curentă ÷ unități. Coloana
                    &bdquo;Medie 3 luni&rdquo; e media prețurilor zilnice reale înregistrate în ultimele 90 de zile
                    (vezi sincronizarea automată de preț) — cerință: cel puțin {MIN_SIGNAL_SAMPLES.toString()} prețuri
                    distincte în fereastră, altfel apare &bdquo;date insuficiente&rdquo;. Semnalul e verde când prețul
                    curent e sub această medie (istoric, moment bun de cumpărat) și roșu când e peste.
                </p>
                {holdingsWithPrice.length === 0 ? (
                    <p className="text-xs text-faint italic text-center py-6">
                        Niciun holding cu unități completate încă — prețul mediu are nevoie de unități pentru a fi calculat.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Fond</th>
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Cont</th>
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Unități</th>
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Preț mediu intrare</th>
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Preț curent</th>
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Diferență</th>
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Medie 3 luni</th>
                                    <th className="py-2 pr-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Semnal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {holdingsWithPrice.map((h) => (
                                    <tr key={h.holdingId}>
                                        <td className="py-2.5 pr-4 text-sm text-foreground">
                                            {h.fundName} {h.ticker && <span className="text-faint">({h.ticker})</span>}
                                        </td>
                                        <td className="py-2.5 pr-4 text-xs text-muted">{h.accountName}</td>
                                        <td className="py-2.5 pr-4 text-xs text-muted font-num">{h.units.toLocaleString("ro-RO", { maximumFractionDigits: 4 })}</td>
                                        <td className="py-2.5 pr-4 text-sm text-foreground font-num">{formatMoney(h.avgPrice, h.currency)}</td>
                                        <td className="py-2.5 pr-4 text-sm text-foreground font-num">{formatMoney(h.currentPrice, h.currency)}</td>
                                        <td className={cn("py-2.5 pr-4 text-sm font-medium", h.diffPercent >= 0 ? "text-green-400" : "text-red-400")}>
                                            {h.diffPercent >= 0 ? "+" : ""}{h.diffPercent.toFixed(1)}%
                                        </td>
                                        <td className="py-2.5 pr-4 text-sm text-foreground font-num">
                                            {h.hasSignal ? formatMoney(h.avg3mPrice as number, h.currency) : <span className="text-faint">—</span>}
                                        </td>
                                        <td className="py-2.5 pr-4">
                                            {h.hasSignal ? (
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border",
                                                        h.isBuySignal
                                                            ? "bg-green-500/10 border-green-400/30 text-green-400"
                                                            : "bg-red-500/10 border-red-400/30 text-red-400"
                                                    )}
                                                    title={h.isBuySignal ? "Preț curent sub media ultimelor 3 luni" : "Preț curent peste media ultimelor 3 luni"}
                                                >
                                                    {h.isBuySignal ? "Sub medie" : "Peste medie"}
                                                    {" "}
                                                    ({(h.vsAvg3mPercent as number) >= 0 ? "+" : ""}
                                                    {(h.vsAvg3mPercent as number).toFixed(1)}%)
                                                </span>
                                            ) : (
                                                <span className="text-xs text-faint italic">date insuficiente</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

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
                                {visibleHistory!.map((series, i) => (
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

            <Card className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-medium text-foreground">Profitabilitate</p>
                    <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1 w-fit">
                        {([
                            ["monthly", "Lunar"],
                            ["yearly", "Anual"],
                        ] as const).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setPeriodMode(key)}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                                    periodMode === key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="text-xs text-muted mb-4">
                    Variația procentuală a valorii {selectedAccountId === "all" ? "portofoliului (toate conturile)" : "acestui cont"} față de {periodMode === "monthly" ? "luna" : "anul"} anterior(ă) —
                    aceeași sursă ca graficul de evoluție de mai sus.
                </p>
                {history === null ? (
                    <div className="flex items-center gap-2 text-xs text-muted py-10 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă...
                    </div>
                ) : profitabilityData.length < 2 ? (
                    <p className="text-xs text-faint italic text-center py-10">
                        Nu există încă suficiente date pentru {periodMode === "monthly" ? "cel puțin două luni" : "cel puțin doi ani"} — revino după ce mai trece timp și/sau se mai sincronizează prețuri.
                    </p>
                ) : (
                    <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={profitabilityData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" {...chartAxisProps} />
                                <YAxis {...chartAxisProps} tickFormatter={(v) => `${v}%`} width={48} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} formatter={(v) => [`${Number(v).toFixed(1)}%`, "Randament"]} />
                                <Bar dataKey="returnPercent" name="Randament" radius={[4, 4, 0, 0]}>
                                    {profitabilityData.map((d, i) => (
                                        <Cell key={i} fill={d.returnPercent >= 0 ? "#52c98a" : "#d65252"} />
                                    ))}
                                </Bar>
                            </BarChart>
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

    const [expandedContribId, setExpandedContribId] = useState<string | null>(null);
    const [contributions, setContributions] = useState<Record<string, ContributionRow[]>>({});
    const [contribLoading, setContribLoading] = useState<Record<string, boolean>>({});
    const [contribForm, setContribForm] = useState<{ date: string; units: string; amount: string }>({ date: format(new Date(), "yyyy-MM-dd"), units: "", amount: "" });
    const [contribError, setContribError] = useState<string | null>(null);

    function loadContributions(holdingId: string) {
        setContribLoading((prev) => ({ ...prev, [holdingId]: true }));
        getVanguardContributions(holdingId)
            .then((rows) => setContributions((prev) => ({ ...prev, [holdingId]: rows })))
            .finally(() => setContribLoading((prev) => ({ ...prev, [holdingId]: false })));
    }

    function toggleContributions(holdingId: string) {
        if (expandedContribId === holdingId) {
            setExpandedContribId(null);
            return;
        }
        setExpandedContribId(holdingId);
        setContribError(null);
        setContribForm({ date: format(new Date(), "yyyy-MM-dd"), units: "", amount: "" });
        loadContributions(holdingId);
    }

    function submitContribution(holdingId: string) {
        const units = parseFloat(contribForm.units);
        const amount = parseFloat(contribForm.amount);
        if (!contribForm.date || isNaN(units) || units <= 0 || isNaN(amount) || amount <= 0) {
            setContribError("Data, unitățile și suma sunt obligatorii și trebuie să fie pozitive.");
            return;
        }
        setContribError(null);
        startTransition(async () => {
            try {
                const input: VanguardContributionInput = { holdingId, date: contribForm.date, units, amount };
                const { holding: updated } = await addVanguardContribution(input);
                setAccounts((prev) =>
                    prev.map((a) =>
                        a.id === account.id
                            ? {
                                  ...a,
                                  holdings: a.holdings.map((h) =>
                                      h.id === holdingId
                                          ? { ...h, units: Number(updated.units), costBasis: Number(updated.costBasis), currentValue: Number(updated.currentValue), valueUpdatedAt: updated.valueUpdatedAt.toISOString() }
                                          : h
                                  ),
                              }
                            : a
                    )
                );
                setContribForm({ date: format(new Date(), "yyyy-MM-dd"), units: "", amount: "" });
                loadContributions(holdingId);
            } catch (e: any) {
                setContribError(e.message || "A apărut o eroare.");
            }
        });
    }

    function removeContribution(holdingId: string, contributionId: string) {
        if (!confirm("Ștergi această contribuție? Unitățile și suma investită se scad din holding.")) return;
        startTransition(async () => {
            await deleteVanguardContribution(contributionId);
            const row = (contributions[holdingId] || []).find((c) => c.id === contributionId);
            if (row) {
                setAccounts((prev) =>
                    prev.map((a) =>
                        a.id === account.id
                            ? {
                                  ...a,
                                  holdings: a.holdings.map((h) =>
                                      h.id === holdingId
                                          ? { ...h, units: (h.units ?? 0) - row.units, costBasis: h.costBasis - row.amount, currentValue: h.currentValue - row.amount }
                                          : h
                                  ),
                              }
                            : a
                    )
                );
            }
            loadContributions(holdingId);
        });
    }

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
                    <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{account.name}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2 py-0.5">
                            <User className="w-3 h-3" />
                            {ownerBadgeLabel(account.owner, account.ownerLabel)}
                        </span>
                    </div>
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
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Unități</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Investit</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Valoare curentă</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Actualizat</th>
                            <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {account.holdings.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-10 text-center text-faint italic text-sm">Niciun holding în acest cont.</td></tr>
                        ) : (
                            account.holdings.map((h) => {
                                const pnl = h.currentValue - h.costBasis;
                                const pnlPercent = h.costBasis > 0 ? (pnl / h.costBasis) * 100 : 0;
                                const isExpanded = expandedHistoryId === h.id;
                                const isContribExpanded = expandedContribId === h.id;
                                return (
                                    <React.Fragment key={h.id}>
                                        <tr className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-6 py-4 text-sm text-foreground">
                                                {h.fundName} {h.ticker && <span className="text-faint">({h.ticker})</span>}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-muted font-num">{h.units !== null ? h.units.toLocaleString("ro-RO", { maximumFractionDigits: 4 }) : "—"}</td>
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
                                                    <button onClick={() => toggleContributions(h.id)} title="Istoric investiții (dată + unități)" className={cn("p-1.5 rounded-lg hover:bg-white/5", isContribExpanded ? "text-primary" : "text-muted hover:text-primary")}>
                                                        <History className="w-3.5 h-3.5" />
                                                    </button>
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
                                        {isContribExpanded && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={6} className="px-6 py-4">
                                                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
                                                        <div className="space-y-1">
                                                            <label className="text-xs text-muted">Data</label>
                                                            <input type="date" value={contribForm.date} onChange={(e) => setContribForm({ ...contribForm, date: e.target.value })} className="bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs text-muted">Unități</label>
                                                            <input type="number" step="0.0001" value={contribForm.units} onChange={(e) => setContribForm({ ...contribForm, units: e.target.value })} className="w-28 bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs text-muted">Sumă investită</label>
                                                            <input type="number" step="0.01" value={contribForm.amount} onChange={(e) => setContribForm({ ...contribForm, amount: e.target.value })} className="w-32 bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                                                        </div>
                                                        {isAdmin && (
                                                            <Button variant="primary" size="sm" onClick={() => submitContribution(h.id)} disabled={isPending}>
                                                                <Plus className="w-3.5 h-3.5 mr-1.5" /> Adaugă
                                                            </Button>
                                                        )}
                                                    </div>
                                                    {contribError && <p className="text-sm text-red-400 mb-3">{contribError}</p>}
                                                    {contribLoading[h.id] ? (
                                                        <div className="flex items-center gap-2 text-xs text-muted py-6 justify-center">
                                                            <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă...
                                                        </div>
                                                    ) : (contributions[h.id]?.length ?? 0) === 0 ? (
                                                        <p className="text-xs text-faint italic text-center py-4">Nicio contribuție înregistrată încă — holdingul are doar totalul inițial.</p>
                                                    ) : (
                                                        <table className="w-full text-left">
                                                            <thead>
                                                                <tr className="text-[10px] text-muted uppercase tracking-wider">
                                                                    <th className="py-1.5 pr-4 font-medium">Dată</th>
                                                                    <th className="py-1.5 pr-4 font-medium">Unități</th>
                                                                    <th className="py-1.5 pr-4 font-medium">Sumă</th>
                                                                    {isAdmin && <th className="py-1.5 pr-4 font-medium text-right">Acțiuni</th>}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-white/5">
                                                                {contributions[h.id]!.map((c) => (
                                                                    <tr key={c.id}>
                                                                        <td className="py-2 pr-4 text-xs text-muted">{format(new Date(c.date), "dd MMM yyyy")}</td>
                                                                        <td className="py-2 pr-4 text-xs text-foreground font-num">{c.units.toLocaleString("ro-RO", { maximumFractionDigits: 4 })}</td>
                                                                        <td className="py-2 pr-4 text-xs text-foreground">{formatMoney(c.amount, account.currency)}</td>
                                                                        {isAdmin && (
                                                                            <td className="py-2 pr-4 text-right">
                                                                                <button onClick={() => removeContribution(h.id, c.id)} className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-500/10">
                                                                                    <Trash2 className="w-3 h-3" />
                                                                                </button>
                                                                            </td>
                                                                        )}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                        {isExpanded && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={6} className="px-6 py-4">
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
