"use client";

import React, { useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, X, Check, RotateCcw, Trash2, BellRing } from "lucide-react";
import { createReminder, dismissReminder, reopenReminder, deleteReminder, type ReminderInput } from "@/app/actions/reminders";

interface ReminderRow {
    id: string;
    title: string;
    type: string | null;
    dueDate: string;
    notes: string | null;
    vehicleId: string | null;
    vehicleName: string | null;
    isDismissed: boolean;
    urgency: "overdue" | "due_soon" | "upcoming";
}

const urgencyStyles: Record<string, string> = {
    overdue: "bg-red-500/10 text-red-300 border-red-400/30",
    due_soon: "bg-amber-500/10 text-amber-300 border-amber-400/30",
    upcoming: "bg-white/[0.04] text-muted border-border",
};
const urgencyLabels: Record<string, string> = {
    overdue: "Restant",
    due_soon: "În curând",
    upcoming: "Viitor",
};
const urgencyDot: Record<string, string> = {
    overdue: "bg-red-400",
    due_soon: "bg-amber-400",
    upcoming: "bg-green-400",
};

const inputClass = "w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors";

export function RemindersClient({ initialReminders, vehicles }: { initialReminders: ReminderRow[]; vehicles: { id: string; name: string }[] }) {
    const [reminders, setReminders] = useState(initialReminders);
    const [showDismissed, setShowDismissed] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<ReminderInput>({ title: "", dueDate: new Date().toISOString().slice(0, 10) });
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submit() {
        if (!form.title.trim() || !form.dueDate) {
            setError("Titlul și data scadentă sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const created = await createReminder(form);
                const daysUntil = (new Date(created.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
                const urgency = daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "due_soon" : "upcoming";
                setReminders((prev) => [
                    { id: created.id, title: created.title, type: created.type, dueDate: created.dueDate.toISOString(), notes: created.notes, vehicleId: created.vehicleId, vehicleName: vehicles.find((v) => v.id === created.vehicleId)?.name || null, isDismissed: false, urgency },
                    ...prev,
                ]);
                setForm({ title: "", dueDate: new Date().toISOString().slice(0, 10) });
                setShowForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function toggleDismiss(r: ReminderRow) {
        startTransition(async () => {
            if (r.isDismissed) {
                await reopenReminder(r.id);
            } else {
                await dismissReminder(r.id);
            }
            setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, isDismissed: !x.isDismissed } : x)));
        });
    }

    function remove(id: string) {
        if (!confirm("Ștergi acest reminder?")) return;
        startTransition(async () => {
            await deleteReminder(id);
            setReminders((prev) => prev.filter((r) => r.id !== id));
        });
    }

    const visible = reminders.filter((r) => showDismissed || !r.isDismissed);
    const active = reminders.filter((r) => !r.isDismissed);
    const overdueCount = active.filter((r) => r.urgency === "overdue").length;
    const dueSoonCount = active.filter((r) => r.urgency === "due_soon").length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Reminders</span>
                    </h1>
                    <p className="text-muted text-sm">
                        {overdueCount > 0 && <span className="text-red-400">{overdueCount} restante</span>}
                        {overdueCount > 0 && dueSoonCount > 0 && " · "}
                        {dueSoonCount > 0 && <span className="text-amber-300">{dueSoonCount} în curând</span>}
                        {overdueCount === 0 && dueSoonCount === 0 && "Totul la zi"}
                    </p>
                </div>
                <Button variant="primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showForm ? "Anulează" : "Adaugă reminder"}
                </Button>
            </div>

            {showForm && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Titlu</label>
                            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex. MOT Skoda Octavia" className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data scadentă</label>
                            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Tip (opțional)</label>
                            <input value={form.type || ""} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="MOT, Asigurare, Service..." className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Vehicul (opțional)</label>
                            <select value={form.vehicleId || ""} onChange={(e) => setForm({ ...form, vehicleId: e.target.value || null })} className={inputClass}>
                                <option value="">— Fără vehicul —</option>
                                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs text-muted">Notițe (opțional)</label>
                            <textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputClass} />
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

            <label className="flex items-center gap-2 text-xs text-muted w-fit">
                <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
                Arată și cele rezolvate
            </label>

            {visible.length === 0 ? (
                <Card className="p-16 text-center">
                    <BellRing className="w-6 h-6 mx-auto mb-2 opacity-40 text-faint" />
                    <p className="text-faint italic">Niciun reminder.</p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {visible.map((r) => (
                        <Card key={r.id} className={cn("p-4 flex items-center justify-between gap-4", r.isDismissed && "opacity-50")}>
                            <div className="flex items-center gap-3 min-w-0">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", urgencyDot[r.urgency])} />
                                <div className="min-w-0">
                                    <p className="text-sm text-foreground font-medium truncate">{r.title}</p>
                                    <p className="text-xs text-muted mt-0.5">
                                        {format(new Date(r.dueDate), "dd MMM yyyy")}
                                        {r.type && ` · ${r.type}`}
                                        {r.vehicleName && ` · ${r.vehicleName}`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider", urgencyStyles[r.urgency])}>
                                    {urgencyLabels[r.urgency]}
                                </span>
                                <button onClick={() => toggleDismiss(r)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5" disabled={isPending} title={r.isDismissed ? "Redeschide" : "Marchează rezolvat"}>
                                    {r.isDismissed ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10" disabled={isPending}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
