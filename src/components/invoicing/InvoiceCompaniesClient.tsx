"use client";

import React, { useState, useTransition } from "react";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, Trash2, X, Building2 } from "lucide-react";
import { createInvoiceCompany, deleteInvoiceCompany, type InvoiceCompanyInput } from "@/app/actions/invoices";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface CompanyRow extends InvoiceCompanyInput {
    id: string;
}

const emptyForm: InvoiceCompanyInput = {
    name: "",
    representativeName: "",
    registrationNumber: "",
    vatNumber: "",
    address: "",
    bankName: "",
    sortCode: "",
    accountNumber: "",
    iban: "",
    currency: "GBP",
    defaultVatRate: 20,
};

const inputClass =
    "w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors";

export function InvoiceCompaniesClient({ initialCompanies }: { initialCompanies: CompanyRow[] }) {
    const isAdmin = useIsAdmin();
    const [companies, setCompanies] = useState(initialCompanies);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<InvoiceCompanyInput>(emptyForm);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submit() {
        if (!form.name.trim() || !form.address.trim() || !form.currency.trim()) {
            setError("Nume, adresă și monedă sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const created = await createInvoiceCompany(form);
                setCompanies((prev) => [{ ...form, id: created.id, registrationNumber: created.registrationNumber ?? "" }, ...prev]);
                setShowForm(false);
                setForm(emptyForm);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function remove(id: string) {
        if (!confirm("Ștergi această companie?")) return;
        startTransition(async () => {
            try {
                await deleteInvoiceCompany(id);
                setCompanies((prev) => prev.filter((c) => c.id !== id));
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
                        <span className="gradient-text">Companii</span>
                    </h1>
                    <p className="text-muted text-sm">{companies.length} companii care emit facturi</p>
                </div>
                {isAdmin && (
                    <Button variant="primary" onClick={() => { setForm(emptyForm); setShowForm(true); setError(null); }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Companie nouă
                    </Button>
                )}
            </div>

            {showForm && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Companie nouă</h3>
                        <button onClick={() => setShowForm(false)} className="text-faint hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Nume companie</label>
                            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Reprezentant (opțional)</label>
                            <input className={inputClass} value={form.representativeName} onChange={(e) => setForm({ ...form, representativeName: e.target.value })} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs text-muted">Adresă</label>
                            <textarea rows={2} className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cod înregistrare (opțional)</label>
                            <input className={inputClass} value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cod TVA (opțional)</label>
                            <input className={inputClass} value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Bancă</label>
                            <input className={inputClass} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Sort code</label>
                            <input className={inputClass} value={form.sortCode} onChange={(e) => setForm({ ...form, sortCode: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cont bancar</label>
                            <input className={inputClass} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">IBAN (opțional)</label>
                            <input className={inputClass} value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Monedă</label>
                            <input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cotă TVA implicită (%)</label>
                            <input type="number" step="0.01" className={inputClass} value={form.defaultVatRate} onChange={(e) => setForm({ ...form, defaultVatRate: parseFloat(e.target.value) || 0 })} />
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
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">TVA</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Monedă</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {companies.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-faint italic">
                                        <Building2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Nicio companie încă.
                                    </td>
                                </tr>
                            ) : (
                                companies.map((c) => (
                                    <tr key={c.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{c.name}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{c.vatNumber || "—"}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{c.currency}</td>
                                        <td className="px-6 py-4 text-right">
                                            {isAdmin && (
                                                <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
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
