"use client";

import React, { useState, useTransition } from "react";
import { Card, Button } from "@/components/ui/core";
import { Plus, Trash2, Pencil, X, Users } from "lucide-react";
import { createInvoiceClient, updateInvoiceClient, deleteInvoiceClient, type InvoiceClientInput } from "@/app/actions/invoices";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface ClientRow extends InvoiceClientInput {
    id: string;
}

const emptyForm: InvoiceClientInput = {
    name: "",
    representativeName: "",
    email: "",
    country: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    vatNumber: "",
};

const inputClass =
    "w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors";

export function InvoiceClientsClient({ initialClients }: { initialClients: ClientRow[] }) {
    const isAdmin = useIsAdmin();
    const [clients, setClients] = useState(initialClients);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<InvoiceClientInput>(emptyForm);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function openNew() {
        setForm(emptyForm);
        setEditingId(null);
        setShowForm(true);
        setError(null);
    }

    function openEdit(row: ClientRow) {
        setForm({ ...row });
        setEditingId(row.id);
        setShowForm(true);
        setError(null);
    }

    function submit() {
        if (!form.name.trim() || !form.email.trim() || !form.addressLine1.trim() || !form.city.trim() || !form.postalCode.trim() || !form.country.trim()) {
            setError("Nume, email, adresă, oraș, cod poștal și țară sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                if (editingId) {
                    await updateInvoiceClient(editingId, form);
                    setClients((prev) => prev.map((c) => (c.id === editingId ? { ...form, id: editingId } : c)));
                } else {
                    const created = await createInvoiceClient(form);
                    setClients((prev) => [{ ...form, id: created.id }, ...prev]);
                }
                setShowForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function remove(id: string) {
        if (!confirm("Ștergi acest client?")) return;
        startTransition(async () => {
            try {
                await deleteInvoiceClient(id);
                setClients((prev) => prev.filter((c) => c.id !== id));
            } catch (e: any) {
                alert(e.message || "Nu s-a putut șterge.");
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Clienți</span>
                    </h1>
                    <p className="text-muted text-sm">{clients.length} clienți</p>
                </div>
                {isAdmin && (
                    <Button variant="primary" onClick={openNew}>
                        <Plus className="w-4 h-4 mr-2" />
                        Client nou
                    </Button>
                )}
            </div>

            {showForm && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">{editingId ? "Editează client" : "Client nou"}</h3>
                        <button onClick={() => setShowForm(false)} className="text-faint hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Nume</label>
                            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Email</label>
                            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs text-muted">Reprezentant (opțional)</label>
                            <input className={inputClass} value={form.representativeName} onChange={(e) => setForm({ ...form, representativeName: e.target.value })} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs text-muted">Adresă (linia 1)</label>
                            <input className={inputClass} value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs text-muted">Adresă (linia 2, opțional)</label>
                            <input className={inputClass} value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Oraș</label>
                            <input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Regiune/Județ (opțional)</label>
                            <input className={inputClass} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cod poștal</label>
                            <input className={inputClass} value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Țară</label>
                            <input className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cod TVA client (opțional)</label>
                            <input className={inputClass} value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                    <div className="flex gap-2 mt-4">
                        <Button variant="primary" onClick={submit} disabled={isPending}>{isPending ? "Se salvează..." : "Salvează"}</Button>
                        <Button variant="ghost" onClick={() => setShowForm(false)}>Anulează</Button>
                    </div>
                </Card>
            )}

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Nume</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Email</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Țară</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {clients.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-faint italic">
                                        <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Niciun client încă.
                                    </td>
                                </tr>
                            ) : (
                                clients.map((c) => (
                                    <tr key={c.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{c.name}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{c.email}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{c.country}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {isAdmin && (
                                                    <>
                                                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10">
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
        </div>
    );
}
