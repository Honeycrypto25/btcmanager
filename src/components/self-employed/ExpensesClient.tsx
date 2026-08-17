"use client";

import React, { useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button } from "@/components/ui/core";
import { Plus, Trash2, Pencil, X, Receipt, Tag, Eye } from "lucide-react";
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

export function ExpensesClient({ initialExpenses, categories }: { initialExpenses: ExpenseRow[]; categories: string[] }) {
    const [expenses, setExpenses] = useState(initialExpenses);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ExpenseInput>(emptyForm(categories[0]));
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [categoryPendingId, setCategoryPendingId] = useState<string | null>(null);

    const filtered = categoryFilter ? expenses.filter((e) => e.category === categoryFilter) : expenses;
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
                <Button variant="primary" onClick={openNew}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adaugă cheltuială
                </Button>
            </div>

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
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-faint italic">
                                        <Receipt className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Nicio cheltuială înregistrată încă.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((row) => (
                                    <tr key={row.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{format(new Date(row.date), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-sm text-foreground">{row.merchant}</td>
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
                                        <td className="px-6 py-4 text-sm font-medium text-red-400">{formatGBP(row.amount)}</td>
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
        </div>
    );
}
