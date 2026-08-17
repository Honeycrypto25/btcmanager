"use client";

import React, { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, Trash2, Pencil, X, Receipt, Tag, Eye, TrendingDown, BarChart3 } from "lucide-react";
import { createExpense, updateExpense, updateExpenseCategory, deleteExpense, type ExpenseInput } from "@/app/actions/self-employed";

interface ExpenseRow {
    id: string;
    date: string;
    merchant: string;
    description: string | null;
    amount: number;
    vatAmount: number | null;
    category: string;
    paymentMethod: string | null;
    businessUsePercentage: number;
    allowableExpenseStatus: string;
    taxYear: string;
    notes: string | null;
    receiptId: string | null;
    accountName: string | null;
}

interface Account {
    id: string;
    name: string;
}

function formatGBP(amount: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(amount);
}

function emptyForm(defaultCategory: string): ExpenseInput {
    return {
        date: new Date().toISOString().slice(0, 10),
        merchant: "",
        description: "",
        amount: 0,
        vatAmount: undefined,
        category: defaultCategory,
        paymentMethod: "",
        businessUsePercentage: 100,
        allowableExpenseStatus: "allowable",
        notes: "",
    };
}

const tooltipStyle = { background: "#121210", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 };
const chartAxisProps = { stroke: "#8c8a80", fontSize: 12 };
const EXPENSE_COLOR = "#d6a24c";

function EmptyChartNote({ message }: { message: string }) {
    return <p className="text-sm text-faint italic py-16 text-center">{message}</p>;
}

type Tab = "list" | "stats";

export function ExpensesClient({ initialExpenses, categories, accounts }: { initialExpenses: ExpenseRow[]; categories: string[]; accounts: Account[] }) {
    const [tab, setTab] = useState<Tab>("list");
    const [expenses, setExpenses] = useState(initialExpenses);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ExpenseInput>(emptyForm(categories[0]));
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [categoryPendingId, setCategoryPendingId] = useState<string | null>(null);

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [search, setSearch] = useState("");
    const [accountFilter, setAccountFilter] = useState("");

    const filtered = useMemo(() => {
        let list = categoryFilter ? expenses.filter((e) => e.category === categoryFilter) : expenses;
        if (dateFrom) list = list.filter((e) => e.date.slice(0, 10) >= dateFrom);
        if (dateTo) list = list.filter((e) => e.date.slice(0, 10) <= dateTo);
        if (accountFilter) list = list.filter((e) => (e.accountName || "") === accountFilter);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((e) => e.merchant.toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q));
        }
        return list;
    }, [expenses, categoryFilter, dateFrom, dateTo, accountFilter, search]);

    const hasActiveFilters = !!(dateFrom || dateTo || accountFilter || search.trim());
    function clearFilters() {
        setDateFrom("");
        setDateTo("");
        setAccountFilter("");
        setSearch("");
    }

    const totalShown = filtered.reduce((sum, e) => sum + e.amount, 0);

    function openNew() {
        setForm(emptyForm(categories[0]));
        setEditingId(null);
        setShowForm(true);
        setError(null);
    }

    function openEdit(row: ExpenseRow) {
        setForm({
            date: row.date.slice(0, 10),
            merchant: row.merchant,
            description: row.description || "",
            amount: row.amount,
            vatAmount: row.vatAmount ?? undefined,
            category: row.category,
            paymentMethod: row.paymentMethod || "",
            businessUsePercentage: row.businessUsePercentage,
            allowableExpenseStatus: row.allowableExpenseStatus,
            notes: row.notes || "",
        });
        setEditingId(row.id);
        setShowForm(true);
        setError(null);
    }

    function submit() {
        if (!form.merchant.trim() || !form.amount) {
            setError("Comerciantul și suma sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                if (editingId) {
                    const updated = await updateExpense(editingId, form);
                    setExpenses((prev) =>
                        prev.map((r) =>
                            r.id === editingId
                                ? {
                                      ...r,
                                      merchant: updated.merchant,
                                      description: updated.description,
                                      amount: Number(updated.amount),
                                      vatAmount: updated.vatAmount !== null ? Number(updated.vatAmount) : null,
                                      category: updated.category,
                                      paymentMethod: updated.paymentMethod,
                                      businessUsePercentage: updated.businessUsePercentage,
                                      allowableExpenseStatus: updated.allowableExpenseStatus,
                                      date: updated.date.toISOString(),
                                      notes: updated.notes,
                                  }
                                : r
                        )
                    );
                } else {
                    const created = await createExpense(form);
                    setExpenses((prev) => [
                        {
                            id: created.id,
                            date: created.date.toISOString(),
                            merchant: created.merchant,
                            description: created.description,
                            amount: Number(created.amount),
                            vatAmount: created.vatAmount !== null ? Number(created.vatAmount) : null,
                            category: created.category,
                            paymentMethod: created.paymentMethod,
                            businessUsePercentage: created.businessUsePercentage,
                            allowableExpenseStatus: created.allowableExpenseStatus,
                            taxYear: created.taxYear,
                            notes: created.notes,
                            receiptId: null,
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
        if (!confirm("Ștergi această cheltuială?")) return;
        startTransition(async () => {
            await deleteExpense(id);
            setExpenses((prev) => prev.filter((r) => r.id !== id));
        });
    }

    function changeCategory(id: string, category: string) {
        setEditingCategoryId(null);
        setCategoryPendingId(id);
        startTransition(async () => {
            try {
                await updateExpenseCategory(id, category);
                setExpenses((prev) => prev.map((r) => (r.id === id ? { ...r, category } : r)));
            } catch (e: any) {
                setError(e.message || "Nu s-a putut schimba categoria.");
            } finally {
                setCategoryPendingId(null);
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Cheltuieli</span>
                    </h1>
                    <p className="text-muted text-sm">{filtered.length} înregistrări · Total {formatGBP(totalShown)}</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1">
                        {([
                            ["list", "Listă", TrendingDown],
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
                    {tab === "list" && (
                        <Button variant="primary" onClick={openNew}>
                            <Plus className="w-4 h-4 mr-2" />
                            Adaugă cheltuială
                        </Button>
                    )}
                </div>
            </div>

            {tab === "list" ? (
                <>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setCategoryFilter(null)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${!categoryFilter ? "bg-primary text-black" : "bg-glass border border-border text-muted hover:text-foreground"}`}
                        >
                            Toate
                        </button>
                        {categories.map((c) => (
                            <button
                                key={c}
                                onClick={() => setCategoryFilter(c === categoryFilter ? null : c)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${categoryFilter === c ? "bg-primary text-black" : "bg-glass border border-border text-muted hover:text-foreground"}`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>

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
                                <label className="text-[11px] text-muted uppercase tracking-wider">Caută comerciant/descriere</label>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="ex. Sainsbury's, EE..."
                                    className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                />
                            </div>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="text-xs text-muted hover:text-red-400 pb-1.5 flex items-center gap-1">
                                    <X className="w-3.5 h-3.5" /> Șterge filtrele
                                </button>
                            )}
                            <span className="text-xs text-faint pb-1.5 ml-auto">
                                {filtered.length} din {expenses.length} înregistrări
                            </span>
                        </div>
                    </Card>

                    {showForm && (
                        <Card className="p-5 sm:p-6 border-primary/30">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-muted uppercase tracking-wider">
                                    {editingId ? "Editează cheltuiala" : "Cheltuială nouă"}
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
                                    <label className="text-xs text-muted">Comerciant</label>
                                    <input
                                        value={form.merchant}
                                        onChange={(e) => setForm({ ...form, merchant: e.target.value })}
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
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">TVA (opțional)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.vatAmount ?? ""}
                                        onChange={(e) => setForm({ ...form, vatAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">Categorie</label>
                                    <select
                                        value={form.category}
                                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    >
                                        {categories.map((c) => (
                                            <option key={c} value={c} className="bg-surface">
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted">% uz business</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={form.businessUsePercentage}
                                        onChange={(e) => setForm({ ...form, businessUsePercentage: parseInt(e.target.value, 10) || 0 })}
                                        className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <label className="text-xs text-muted">Descriere (opțional)</label>
                                    <input
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
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

                    <Card className="overflow-hidden p-0 border-border">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border bg-white/[0.02]">
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Comerciant</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Cont</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-16 text-center text-faint italic">
                                                <Receipt className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                                {expenses.length === 0 ? "Nicio cheltuială înregistrată încă." : "Nicio cheltuială nu corespunde filtrelor."}
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((row) => (
                                            <tr key={row.id} className="hover:bg-white/[0.01] transition-colors group">
                                                <td className="px-6 py-4 text-sm text-foreground whitespace-nowrap">{format(new Date(row.date), "dd MMM yyyy")}</td>
                                                <td className="px-6 py-4 text-sm text-foreground">{row.merchant}</td>
                                                <td className="px-6 py-4 text-sm text-muted whitespace-nowrap">{row.accountName || "—"}</td>
                                                <td className="px-6 py-4 text-sm text-muted">
                                                    {editingCategoryId === row.id ? (
                                                        <select
                                                            autoFocus
                                                            value={row.category}
                                                            onChange={(e) => changeCategory(row.id, e.target.value)}
                                                            onBlur={() => setEditingCategoryId(null)}
                                                            className="bg-white/[0.04] border border-primary rounded-lg px-2 py-1 text-sm text-foreground focus:outline-none"
                                                        >
                                                            {categories.map((c) => (
                                                                <option key={c} value={c} className="bg-surface">
                                                                    {c}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5">
                                                            <span>{categoryPendingId === row.id ? "Se salvează..." : row.category}</span>
                                                            <button
                                                                onClick={() => setEditingCategoryId(row.id)}
                                                                title="Schimbă categoria"
                                                                className="p-1 rounded-md text-faint opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-white/5 transition-opacity"
                                                            >
                                                                <Tag className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-red-400 whitespace-nowrap">{formatGBP(row.amount)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {row.receiptId && (
                                                            <a
                                                                href={`/self-employed/receipts/${row.receiptId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Vezi chitanța atașată"
                                                                className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5"
                                                            >
                                                                <Eye className="w-3.5 h-3.5" />
                                                            </a>
                                                        )}
                                                        <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => remove(row.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
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
                <StatsTab expenses={expenses} />
            )}
        </div>
    );
}

// --- Statistics tab ---

function StatsTab({ expenses }: { expenses: ExpenseRow[] }) {
    const monthly = useMemo(() => {
        const byMonth = new Map<string, { key: string; label: string; amount: number }>();
        for (const e of expenses) {
            const d = new Date(e.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const existing = byMonth.get(key) ?? { key, label: format(d, "MMM yyyy"), amount: 0 };
            existing.amount += e.amount;
            byMonth.set(key, existing);
        }
        return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
    }, [expenses]);

    const byTaxYear = useMemo(() => {
        const map = new Map<string, number>();
        for (const e of expenses) map.set(e.taxYear, (map.get(e.taxYear) ?? 0) + e.amount);
        return Array.from(map.entries())
            .map(([taxYear, amount]) => ({ taxYear, amount }))
            .sort((a, b) => a.taxYear.localeCompare(b.taxYear));
    }, [expenses]);

    const topCategories = useMemo(() => {
        const map = new Map<string, { category: string; amount: number; count: number }>();
        for (const e of expenses) {
            const existing = map.get(e.category) ?? { category: e.category, amount: 0, count: 0 };
            existing.amount += e.amount;
            existing.count += 1;
            map.set(e.category, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    }, [expenses]);

    const topMerchants = useMemo(() => {
        const map = new Map<string, { merchant: string; amount: number; count: number }>();
        for (const e of expenses) {
            const key = e.merchant.trim().toLowerCase();
            const existing = map.get(key) ?? { merchant: e.merchant.trim(), amount: 0, count: 0 };
            existing.amount += e.amount;
            existing.count += 1;
            map.set(key, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
    }, [expenses]);

    const byAccount = useMemo(() => {
        const map = new Map<string, { account: string; amount: number; count: number }>();
        for (const e of expenses) {
            const key = e.accountName || "Fără cont (manual)";
            const existing = map.get(key) ?? { account: key, amount: 0, count: 0 };
            existing.amount += e.amount;
            existing.count += 1;
            map.set(key, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    }, [expenses]);

    if (expenses.length === 0) {
        return (
            <Card className="p-5 sm:p-6">
                <EmptyChartNote message="Nu există încă cheltuieli înregistrate pentru a genera statistici." />
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
                            <Line type="monotone" dataKey="amount" name="Cheltuială" stroke={EXPENSE_COLOR} strokeWidth={2} dot={{ r: 3 }} />
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
                            <Bar dataKey="amount" name="Cheltuială" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="overflow-hidden p-0 border-border">
                    <div className="p-5 sm:p-6 pb-0">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-1">Pe categorie</h3>
                    </div>
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-white/[0.02]">
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Nr.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {topCategories.map((c) => (
                                    <tr key={c.category} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-3 text-sm text-foreground">{c.category}</td>
                                        <td className="px-6 py-3 text-sm font-medium text-red-400 whitespace-nowrap">{formatGBP(c.amount)}</td>
                                        <td className="px-6 py-3 text-sm text-muted">{c.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="overflow-hidden p-0 border-border">
                    <div className="p-5 sm:p-6 pb-0">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-1">Top comercianți</h3>
                    </div>
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-white/[0.02]">
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Comerciant</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                    <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Nr.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {topMerchants.map((m) => (
                                    <tr key={m.merchant} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-3 text-sm text-foreground">{m.merchant}</td>
                                        <td className="px-6 py-3 text-sm font-medium text-red-400 whitespace-nowrap">{formatGBP(m.amount)}</td>
                                        <td className="px-6 py-3 text-sm text-muted">{m.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            <Card className="overflow-hidden p-0 border-border">
                <div className="p-5 sm:p-6 pb-0">
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-1">Cheltuială pe cont bancar</h3>
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
                                    <td className="px-6 py-3 text-sm font-medium text-red-400 whitespace-nowrap">{formatGBP(a.amount)}</td>
                                    <td className="px-6 py-3 text-sm text-muted">{a.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
