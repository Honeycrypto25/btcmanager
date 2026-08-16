"use client";

import React, { useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, X, Trash2, Target, Check } from "lucide-react";
import { createGoal, updateGoalProgress, deleteGoal, type GoalInput } from "@/app/actions/goals";

interface GoalRow {
    id: string;
    title: string;
    category: string | null;
    targetAmount: number;
    currentAmount: number;
    currency: string;
    targetDate: string | null;
    notes: string | null;
    isAchieved: boolean;
}

const inputClass = "w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors";

function formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const CATEGORIES = ["Savings", "Investment", "Debt payoff", "Emergency fund", "Other"];

export function GoalsClient({ initialGoals }: { initialGoals: GoalRow[] }) {
    const [goals, setGoals] = useState(initialGoals);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<GoalInput>({ title: "", targetAmount: 0, currentAmount: 0, currency: "GBP" });
    const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
    const [progressValue, setProgressValue] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submit() {
        if (!form.title.trim() || !form.targetAmount) {
            setError("Titlul și suma țintă sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const created = await createGoal(form);
                setGoals((prev) => [
                    ...prev,
                    { id: created.id, title: created.title, category: created.category, targetAmount: Number(created.targetAmount), currentAmount: Number(created.currentAmount), currency: created.currency, targetDate: created.targetDate ? created.targetDate.toISOString() : null, notes: created.notes, isAchieved: created.isAchieved },
                ]);
                setForm({ title: "", targetAmount: 0, currentAmount: 0, currency: "GBP" });
                setShowForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function saveProgress(id: string) {
        const val = parseFloat(progressValue);
        if (isNaN(val)) return;
        startTransition(async () => {
            const target = goals.find((g) => g.id === id)?.targetAmount ?? 0;
            await updateGoalProgress(id, val);
            setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, currentAmount: val, isAchieved: val >= target } : g)));
            setEditingProgressId(null);
        });
    }

    function remove(id: string) {
        if (!confirm("Ștergi acest obiectiv?")) return;
        startTransition(async () => {
            await deleteGoal(id);
            setGoals((prev) => prev.filter((g) => g.id !== id));
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Goals</span>
                    </h1>
                    <p className="text-muted text-sm">{goals.length} obiective · {goals.filter((g) => g.isAchieved).length} atinse</p>
                </div>
                <Button variant="primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showForm ? "Anulează" : "Adaugă obiectiv"}
                </Button>
            </div>

            {showForm && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Titlu</label>
                            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex. Fond de urgență 3 luni" className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Categorie</label>
                            <select value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                                <option value="">— Alege —</option>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Sumă țintă</label>
                            <input type="number" step="0.01" value={form.targetAmount || ""} onChange={(e) => setForm({ ...form, targetAmount: parseFloat(e.target.value) || 0 })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Sumă curentă</label>
                            <input type="number" step="0.01" value={form.currentAmount || ""} onChange={(e) => setForm({ ...form, currentAmount: parseFloat(e.target.value) || 0 })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Dată țintă (opțional)</label>
                            <input type="date" value={form.targetDate || ""} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Monedă</label>
                            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass} />
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                    <div className="flex gap-2 mt-4">
                        <Button variant="primary" onClick={submit} disabled={isPending}>
                            {isPending ? "Se salvează..." : "Salvează"}
                        </Button>
                    </div>
                </Card>
            )}

            {goals.length === 0 ? (
                <Card className="p-16 text-center">
                    <Target className="w-6 h-6 mx-auto mb-2 opacity-40 text-faint" />
                    <p className="text-faint italic">Niciun obiectiv adăugat încă.</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {goals.map((g) => {
                        const pct = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
                        return (
                            <Card key={g.id} className={cn("p-5", g.isAchieved && "border-green-400/30")}>
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <p className="font-medium text-foreground flex items-center gap-2">
                                            {g.title}
                                            {g.isAchieved && <Check className="w-4 h-4 text-green-400" />}
                                        </p>
                                        <p className="text-xs text-muted mt-0.5">
                                            {g.category || "—"}
                                            {g.targetDate && ` · până la ${format(new Date(g.targetDate), "dd MMM yyyy")}`}
                                        </p>
                                    </div>
                                    <button onClick={() => remove(g.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-2 mt-3">
                                    <div className={cn("h-full rounded-full transition-all", g.isAchieved ? "bg-green-400" : "bg-primary")} style={{ width: `${pct}%` }} />
                                </div>

                                <div className="flex items-center justify-between">
                                    {editingProgressId === g.id ? (
                                        <div className="flex items-center gap-1">
                                            <input type="number" step="0.01" value={progressValue} onChange={(e) => setProgressValue(e.target.value)} className="w-28 bg-white/[0.06] border border-border rounded-lg px-2 py-1 text-sm text-foreground" autoFocus />
                                            <button onClick={() => saveProgress(g.id)} className="p-1 rounded text-green-400 hover:bg-green-500/10"><Check className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => setEditingProgressId(null)} className="p-1 rounded text-muted hover:bg-white/5"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ) : (
                                        <button onClick={() => { setEditingProgressId(g.id); setProgressValue(String(g.currentAmount)); }} className="text-sm text-foreground hover:text-primary">
                                            {formatMoney(g.currentAmount, g.currency)} <span className="text-muted">/ {formatMoney(g.targetAmount, g.currency)}</span>
                                        </button>
                                    )}
                                    <span className="text-xs text-muted">{pct.toFixed(0)}%</span>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
