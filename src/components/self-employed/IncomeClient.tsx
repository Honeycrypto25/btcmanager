"use client";

import React, { useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, Trash2, Pencil, X, TrendingUp } from "lucide-react";
import { createIncome, updateIncome, deleteIncome, type IncomeInput } from "@/app/actions/self-employed";

interface IncomeRow {
    id: string;
    date: string;
    description: string;
    client: string | null;
    amount: number;
    paymentMethod: string | null;
    taxYear: string;
    notes: string | null;
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

export function IncomeClient({ initialIncomes }: { initialIncomes: IncomeRow[] }) {
    const [incomes, setIncomes] = useState(initialIncomes);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<IncomeInput>(emptyForm);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

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
                <Button variant="primary" onClick={openNew}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adaugă venit
                </Button>
            </div>

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

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Descriere</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Client</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {incomes.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-faint italic">
                                        <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Nicio înregistrare de venit încă.
                                    </td>
                                </tr>
                            ) : (
                                incomes.map((row) => (
                                    <tr key={row.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{format(new Date(row.date), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-sm text-foreground">{row.description}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{row.client || "—"}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-green-400">{formatGBP(row.amount)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
