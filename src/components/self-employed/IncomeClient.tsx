"use client";

import React, { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, Trash2, Pencil, X, TrendingUp, BarChart3 } from "lucide-react";
import { createIncome, updateIncome, deleteIncome, type IncomeInput } from "@/app/actions/self-employed";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface IncomeRow {
    id: string;
    date: string;
    description: string;
    client: string | null;
    amount: number;
    paymentMethod: string | null;
    taxYear: string;
    notes: string | null;
    accountName: string | null;
}

interface Account {
    id: string;
    name: string;
}

function formatGBP(amount: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(amount);
}

const emptyForm: IncomeInput = {
    date: new Date().toISOString().slice(0, 10),
    description: "",
    client: "",
    amount: 0,
    paymentMethod: "",
    notes: "",
};

const tooltipStyle = { background: "#121210", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 };
const chartAxisProps = { stroke: "#8c8a80", fontSize: 12 };

function EmptyChartNote({ message }: { message: string }) {
    return <p className="text-sm text-faint italic py-16 text-center">{message}</p>;
}

type Tab = "list" | "stats";

export function IncomeClient({ initialIncomes, accounts }: { initialIncomes: IncomeRow[]; accounts: Account[] }) {
    const [tab, setTab] = useState<Tab>("list");
    const isAdmin = useIsAdmin();
    const [incomes, setIncomes] = useState(initialIncomes);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<IncomeInput>(emptyForm);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [search, setSearch] = useState("");
    const [accountFilter, setAccountFilter] = useState("");

    const filtered = useMemo(() => {
        let list = incomes;
        if (dateFrom) list = list.filter((i) => i.date.slice(0, 10) >= dateFrom);
        if (dateTo) list = list.filter((i) => i.date.slice(0, 10) <= dateTo);
        if (accountFilter) list = list.filter((i) => (i.accountName || "") === accountFilter);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((i) => i.description.toLowerCase().includes(q) || (i.client || "").toLowerCase().includes(q));
        }
        return list;
    }, [incomes, dateFrom, dateTo, accountFilter, search]);

    const hasActiveFilters = !!(dateFrom || dateTo || accountFilter || search.trim());
    function clearFilters() {
        setDateFrom("");
        setDateTo("");
        setAccountFilter("");
        setSearch("");
    }

    const totalShown = incomes.reduce((sum, i) => sum + i.amount, 0);

    function openNew() {
        setForm(emptyForm);
        setEditingId(null);
        setShowForm(true);
        setError(null);
    }

    function openEdit(row: IncomeRow) {
        setForm({
            date: row.date.slice(0, 10),
            description: row.description,
            client: row.client || "",
            amount: row.amount,
            paymentMethod: row.paymentMethod || "",
            notes: row.notes || "",
        });
        setEditingId(row.id);
        setShowForm(true);
        setError(null);
    }

    function submit() {
        if (!form.description.trim() || !form.amount) {
            setError("Descrierea și suma sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                if (editingId) {
                    const updated = await updateIncome(editingId, form);
                    setIncomes((prev) =>
                        prev.map((r) =>
                            r.id === editingId
                                ? { ...r, ...form, id: r.id, amount: Number(updated.amount), date: updated.date.toISOString(), client: updated.client, paymentMethod: updated.paymentMethod, notes: updated.notes, taxYear: updated.taxYear }
                                : r
                        )
                    );
                } else {
                    const created = await createIncome(form);
                    setIncomes((prev) => [
                        {
                            id: created.id,
                            date: created.date.toISOString(),
                            description: created.description,
                            client: created.client,
                            amount: Number(created.amount),
                            paymentMethod: created.paymentMethod,
                            taxYear: created.taxYear,
                            notes: created.notes,
                            accountName: null,
                        },
                        ...prev,
                    ]);
                }
                setShowForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function remove(id: string) {
        if (!confirm("Ștergi această înregistrare de venit?")) return;
        startTransition(async () => {
            await deleteIncome(id);
            setIncomes((prev) => prev.filter((r) => r.id !== id));
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Venituri</span>
                    </h1>
                    <p className="text-muted text-sm">{incomes.length} înregistrări · Total {formatGBP(totalShown)}</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1">
                        {([
                            ["list", "Listă", TrendingUp],
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
                    {tab === "list" && isAdmin && (
                        <Button variant="primary" onClick={openNew}>
                            <Plus className="w-4 h-4 mr-2" />
                            Adaugă venit
                        </Button>
                    )}
                </div>
            </div>

            {tab === "list" ? (
                <>
                    {showForm && (
                        <Card className="p-5 sm:p-6 border-primary/30">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-muted uppercase tracking-wider">
                                    {editingId ? "Editează venit" : "Venit nou"}
                                </h3>
                                <button onClick={() => setShowForm(false)} className="text-faint hover:text-foreground">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Data</label>
                                    <input
                                        type="date"
                                        value={form.date}
                                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Sumă (GBP)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.amount || ""}
                                        onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <label className="text-xs text-muted">Descriere</label>
                                    <input
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Client (opțional)</label>
                                    <input
                                        value={form.client}
                                        onChange={(e) => setForm({ ...form, client: e.target.value })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Metodă plată (opțional)</label>
                                    <input
                                        value={form.paymentMethod}
                                        onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <label className="text-xs text-muted">Notițe (opțional)</label>
                                    <textarea
                                        value={form.notes}
                                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                        rows={2}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                            </div>
                            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                            <div className="flex gap-2 mt-4">
                                <Button variant="primary" onClick={submit} disabled={isPending}>
                                    {isPending ? "Se salvează..." : "Salvează"}
                                </Button>
                                <Button variant="ghost" onClick={() => setShowForm(false)}>
                                    Anulează
                                </Button>
                            </div>
                        </Card>
                    )}

                    <Card className="p-3 sm:p-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] text-muted uppercase tracking-wider">De la</label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] text-muted uppercase tracking-wider">Până la</label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                />
                            </div>
                            {accounts.length > 0 && (
                                <div className="space-y-1">
                                    <label className="text-[11px] text-muted uppercase tracking-wider">Cont</label>
                                    <select
                                        value={accountFilter}
                                        onChange={(e) => setAccountFilter(e.target.value)}
                                        className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                    >
                                        <option value="" className="bg-surface">Toate conturile</option>
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.name} className="bg-surface">{a.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex-1 min-w-[160px] space-y-1">
                                <label className="text-[11px] text-muted uppercase tracking-wider">Caută descriere/client</label>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="ex. Uber, Sussex Drivers..."
                                    className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                />
                            </div>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="text-xs text-muted hover:text-red-400 pb-1.5 flex items-center gap-1">
                                    <X className="w-3.5 h-3.5" /> Șterge filtrele
                                </button>
                            )}
                            <span className="text-xs text-faint pb-1.5 ml-auto">
                                {filtered.length} din {incomes.length} înregistrări
                            </span>
                        </div>
                    </Card>

                    <Card className="overflow-hidden p-0 border-border">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border bg-white/[0.02]">
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Descriere</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Client</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Cont</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-16 text-center text-faint italic">
                                                <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                                {incomes.length === 0 ? "Nicio înregistrare de venit încă." : "Nicio înregistrare nu corespunde filtrelor."}
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((row) => (
                                            <tr key={row.id} className="hover:bg-white/[0.01] transition-colors group">
                                                <td className="px-6 py-4 text-sm text-foreground whitespace-nowrap">{format(new Date(row.date), "dd MMM yyyy")}</td>
                                                <td className="px-6 py-4 text-sm text-foreground">{row.description}</td>
                                                <td className="px-6 py-4 text-sm text-muted">{row.client || "—"}</td>
                                                <td className="px-6 py-4 text-sm text-muted whitespace-nowrap">{row.accountName || "—"}</td>
                                                <td className="px-6 py-4 text-sm font-medium text-green-400 whitespace-nowrap">{formatGBP(row.amount)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {isAdmin && (
                                                            <>
                                                                <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={() => remove(row.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            ) : (
                <StatsTab incomes={incomes} />
            )}
        </div>
    );
}

// --- Statistics tab ---

function StatsTab({ incomes }: { incomes: IncomeRow[] }) {
    const monthly = useMemo(() => {
        const byMonth = new Map<string, { key: string; label: string; amount: number }>();
        for (const i of incomes) {
            const d = new Date(i.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const existing = byMonth.get(key) ?? { key, label: format(d, "MMM yyyy"), amount: 0 };
            existing.amount += i.amount;
            byMonth.set(key, existing);
        }
        return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
    }, [incomes]);

    const byTaxYear = useMemo(() => {
        const map = new Map<string, number>();
        for (const i of incomes) map.set(i.taxYear, (map.get(i.taxYear) ?? 0) + i.amount);
        return Array.from(map.entries())
            .map(([taxYear, amount]) => ({ taxYear, amount }))
            .sort((a, b) => a.taxYear.localeCompare(b.taxYear));
    }, [incomes]);

    const topClients = useMemo(() => {
        const map = new Map<string, { client: string; amount: number; count: number }>();
        for (const i of incomes) {
            const key = i.client?.trim() || "Fără client";
            const existing = map.get(key) ?? { client: key, amount: 0, count: 0 };
            existing.amount += i.amount;
            existing.count += 1;
            map.set(key, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
    }, [incomes]);

    const byAccount = useMemo(() => {
        const map = new Map<string, { account: string; amount: number; count: number }>();
        for (const i of incomes) {
            const key = i.accountName || "Fără cont (manual)";
            const existing = map.get(key) ?? { account: key, amount: 0, count: 0 };
            existing.amount += i.amount;
            existing.count += 1;
            map.set(key, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    }, [incomes]);

    if (incomes.length === 0) {
        return (
            <Card className="p-5 sm:p-6">
                <EmptyChartNote message="Nu există încă înregistrări de venit pentru a genera statistici." />
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="p-5 sm:p-6">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Evoluție lunară</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthly}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="label" {...chartAxisProps} />
                            <YAxis {...chartAxisProps} tickFormatter={(v) => `£${v}`} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatGBP(Number(v))} />
                            <Line type="monotone" dataKey="amount" name="Venit" stroke="#52c98a" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card className="p-5 sm:p-6">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Total pe an fiscal</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byTaxYear}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="taxYear" {...chartAxisProps} />
                            <YAxis {...chartAxisProps} tickFormatter={(v) => `£${v}`} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatGBP(Number(v))} />
                            <Bar dataKey="amount" name="Venit" fill="#52c98a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="overflow-hidden p-0 border-border">
                    <div className="p-5 sm:p-6 pb-0">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-1">Top clienți</h3>
                    </div>
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-white/[0.02]">
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Client</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Nr.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {topClients.map((c) => (
                                    <tr key={c.client} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-3 text-sm text-foreground">{c.client}</td>
                                        <td className="px-6 py-3 text-sm font-medium text-green-400 whitespace-nowrap">{formatGBP(c.amount)}</td>
                                        <td className="px-6 py-3 text-sm text-muted">{c.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="overflow-hidden p-0 border-border">
                    <div className="p-5 sm:p-6 pb-0">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-1">Venit pe cont bancar</h3>
                    </div>
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-white/[0.02]">
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Cont</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Nr.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {byAccount.map((a) => (
                                    <tr key={a.account} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-3 text-sm text-foreground">{a.account}</td>
                                        <td className="px-6 py-3 text-sm font-medium text-green-400 whitespace-nowrap">{formatGBP(a.amount)}</td>
                                        <td className="px-6 py-3 text-sm text-muted">{a.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
}
