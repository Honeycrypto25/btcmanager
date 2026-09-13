"use client";

import React, { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, Trash2, X, FileSignature, Download, Pencil } from "lucide-react";
import {
    createInvoiceRecord,
    updateInvoiceRecord,
    deleteInvoiceRecord,
    getInvoicePdfUrl,
    type InvoiceInput,
    type InvoiceItemInput,
} from "@/app/actions/invoices";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type CustomerRegion = "uk" | "international";
type VatTreatment = "standard_uk" | "not_vat_registered" | "zero_export" | "outside_scope";
type Status = "draft" | "issued" | "paid";

interface InvoiceRow {
    id: string;
    invoiceNumber: string;
    companyId: string;
    companyName: string;
    clientId: string;
    clientName: string;
    issueDate: string;
    dueDate: string;
    currency: string;
    customerRegion: CustomerRegion;
    vatTreatment: VatTreatment;
    status: Status;
    notes: string;
    items: InvoiceItemInput[];
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
    hasPdf: boolean;
}

interface CompanyOption { id: string; name: string; currency: string; defaultVatRate: number }
interface ClientOption { id: string; name: string }

const vatLabels: Record<VatTreatment, string> = {
    standard_uk: "TVA standard UK",
    not_vat_registered: "Fără TVA (neînregistrat)",
    zero_export: "Export cu cotă zero",
    outside_scope: "În afara sferei TVA",
};

const statusLabels: Record<Status, string> = { draft: "Ciornă", issued: "Emisă", paid: "Plătită" };

function money(value: number, currency: string) {
    try {
        return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
    } catch {
        return `${value.toFixed(2)} ${currency}`;
    }
}

function emptyForm(companies: CompanyOption[], clients: ClientOption[]): InvoiceInput {
    const today = new Date().toISOString().slice(0, 10);
    return {
        companyId: companies[0]?.id ?? "",
        clientId: clients[0]?.id ?? "",
        issueDate: today,
        dueDate: today,
        currency: companies[0]?.currency ?? "GBP",
        customerRegion: "uk",
        vatTreatment: "standard_uk",
        status: "draft",
        notes: "",
        items: [{ description: "", quantity: 1, unitPrice: 0 }],
    };
}

const inputClass =
    "w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors";

export function InvoicingClient({
    initialInvoices,
    companies,
    clients,
}: {
    initialInvoices: InvoiceRow[];
    companies: CompanyOption[];
    clients: ClientOption[];
}) {
    const isAdmin = useIsAdmin();
    const [invoices, setInvoices] = useState(initialInvoices);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<InvoiceInput>(() => emptyForm(companies, clients));
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const totalOutstanding = useMemo(
        () => invoices.filter((i) => i.status !== "paid").reduce((sum, i) => sum + i.total, 0),
        [invoices],
    );

    function openNew() {
        if (!companies.length || !clients.length) {
            setError("Adaugă mai întâi o companie și un client înainte de a crea o factură.");
            return;
        }
        setForm(emptyForm(companies, clients));
        setEditingId(null);
        setShowForm(true);
        setError(null);
    }

    function openEdit(row: InvoiceRow) {
        setForm({
            companyId: row.companyId,
            clientId: row.clientId,
            issueDate: row.issueDate,
            dueDate: row.dueDate,
            currency: row.currency,
            customerRegion: row.customerRegion,
            vatTreatment: row.vatTreatment,
            status: row.status,
            notes: row.notes,
            items: row.items.map((it) => ({ ...it })),
        });
        setEditingId(row.id);
        setShowForm(true);
        setError(null);
    }

    function updateItem(index: number, patch: Partial<InvoiceItemInput>) {
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
        }));
    }

    function addItem() {
        setForm((prev) => ({ ...prev, items: [...prev.items, { description: "", quantity: 1, unitPrice: 0 }] }));
    }

    function removeItem(index: number) {
        setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    }

    const selectedCompany = companies.find((c) => c.id === form.companyId);
    const previewSubtotal = form.items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unitPrice || 0), 0);
    const previewVatRate = form.vatTreatment === "standard_uk" ? (selectedCompany?.defaultVatRate ?? 0) : 0;
    const previewVat = previewSubtotal * (previewVatRate / 100);

    function submit() {
        if (!form.companyId || !form.clientId) {
            setError("Alege compania și clientul.");
            return;
        }
        if (!form.items.length || form.items.some((it) => !it.description.trim())) {
            setError("Fiecare articol trebuie să aibă o descriere.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                if (editingId) {
                    const updated = await updateInvoiceRecord(editingId, form);
                    if (updated) {
                        setInvoices((prev) =>
                            prev.map((r) =>
                                r.id === editingId
                                    ? {
                                          ...r,
                                          ...form,
                                          companyName: updated.company.name,
                                          clientName: updated.client.name,
                                          subtotal: Number(updated.subtotal),
                                          vatRate: Number(updated.vatRate),
                                          vatAmount: Number(updated.vatAmount),
                                          total: Number(updated.total),
                                          hasPdf: Boolean(updated.pdfKey),
                                      }
                                    : r,
                            ),
                        );
                    }
                } else {
                    const created = await createInvoiceRecord(form);
                    if (created) {
                        setInvoices((prev) => [
                            {
                                id: created.id,
                                invoiceNumber: created.invoiceNumber,
                                companyId: created.companyId,
                                companyName: created.company.name,
                                clientId: created.clientId,
                                clientName: created.client.name,
                                issueDate: created.issueDate.toISOString().slice(0, 10),
                                dueDate: created.dueDate.toISOString().slice(0, 10),
                                currency: created.currency,
                                customerRegion: created.customerRegion as CustomerRegion,
                                vatTreatment: created.vatTreatment as VatTreatment,
                                status: created.status as Status,
                                notes: created.notes,
                                items: created.items as unknown as InvoiceItemInput[],
                                subtotal: Number(created.subtotal),
                                vatRate: Number(created.vatRate),
                                vatAmount: Number(created.vatAmount),
                                total: Number(created.total),
                                hasPdf: Boolean(created.pdfKey),
                            },
                            ...prev,
                        ]);
                    }
                }
                setShowForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function remove(id: string) {
        if (!confirm("Ștergi această factură? Nu poate fi anulat.")) return;
        startTransition(async () => {
            try {
                await deleteInvoiceRecord(id);
                setInvoices((prev) => prev.filter((r) => r.id !== id));
            } catch (e: any) {
                alert(e.message || "Nu s-a putut șterge.");
            }
        });
    }

    async function download(id: string) {
        setDownloadingId(id);
        try {
            const url = await getInvoicePdfUrl(id);
            if (url) {
                window.open(url, "_blank", "noopener,noreferrer");
            } else {
                alert("PDF-ul nu este încă disponibil pentru această factură.");
            }
        } finally {
            setDownloadingId(null);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Facturare</span>
                    </h1>
                    <p className="text-muted text-sm">
                        {invoices.length} facturi · Neîncasat {money(totalOutstanding, invoices[0]?.currency ?? "GBP")}
                    </p>
                </div>
                {isAdmin && (
                    <Button variant="primary" onClick={openNew}>
                        <Plus className="w-4 h-4 mr-2" />
                        Factură nouă
                    </Button>
                )}
            </div>

            {error && !showForm && <p className="text-sm text-red-400">{error}</p>}

            {showForm && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">{editingId ? "Editează factura" : "Factură nouă"}</h3>
                        <button onClick={() => setShowForm(false)} className="text-faint hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Companie (emitent)</label>
                            <select
                                className={inputClass}
                                value={form.companyId}
                                onChange={(e) => {
                                    const c = companies.find((x) => x.id === e.target.value);
                                    setForm({ ...form, companyId: e.target.value, currency: c?.currency ?? form.currency });
                                }}
                            >
                                {companies.map((c) => (
                                    <option key={c.id} value={c.id} className="bg-surface">{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Client</label>
                            <select className={inputClass} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id} className="bg-surface">{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data emiterii</label>
                            <input type="date" className={inputClass} value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data scadenței</label>
                            <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Monedă</label>
                            <input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Regiune client</label>
                            <select className={inputClass} value={form.customerRegion} onChange={(e) => setForm({ ...form, customerRegion: e.target.value as CustomerRegion })}>
                                <option value="uk" className="bg-surface">UK</option>
                                <option value="international" className="bg-surface">Internațional</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Regim TVA</label>
                            <select className={inputClass} value={form.vatTreatment} onChange={(e) => setForm({ ...form, vatTreatment: e.target.value as VatTreatment })}>
                                {Object.entries(vatLabels).map(([value, label]) => (
                                    <option key={value} value={value} className="bg-surface">{label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Status</label>
                            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
                                {Object.entries(statusLabels).map(([value, label]) => (
                                    <option key={value} value={value} className="bg-surface">{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-5 space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-muted">Articole</label>
                            <button onClick={addItem} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <Plus className="w-3.5 h-3.5" /> Adaugă articol
                            </button>
                        </div>
                        {form.items.map((item, index) => (
                            <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_90px_120px_32px] gap-2 items-center">
                                <input
                                    placeholder="Descriere serviciu"
                                    className={inputClass}
                                    value={item.description}
                                    onChange={(e) => updateItem(index, { description: e.target.value })}
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Cant."
                                    className={inputClass}
                                    value={item.quantity}
                                    onChange={(e) => updateItem(index, { quantity: parseFloat(e.target.value) || 0 })}
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Preț unitar"
                                    className={inputClass}
                                    value={item.unitPrice}
                                    onChange={(e) => updateItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                                />
                                {form.items.length > 1 && (
                                    <button onClick={() => removeItem(index)} className="p-2 text-muted hover:text-red-400">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="space-y-1 mt-4">
                        <label className="text-xs text-muted">Notițe (opțional)</label>
                        <textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>

                    <div className="mt-4 text-sm text-muted space-y-1">
                        <p>Subtotal: <span className="text-foreground">{money(previewSubtotal, form.currency)}</span></p>
                        <p>TVA ({previewVatRate}%): <span className="text-foreground">{money(previewVat, form.currency)}</span></p>
                        <p className="font-medium">Total: <span className="text-foreground">{money(previewSubtotal + previewVat, form.currency)}</span></p>
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
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Nr.</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Client</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Emisă</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Scadentă</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Total</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {invoices.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-faint italic">
                                        <FileSignature className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Nicio factură încă.
                                    </td>
                                </tr>
                            ) : (
                                invoices.map((row) => (
                                    <tr key={row.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground font-medium whitespace-nowrap">{row.invoiceNumber}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{row.clientName}</td>
                                        <td className="px-6 py-4 text-sm text-muted whitespace-nowrap">{format(new Date(row.issueDate), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-sm text-muted whitespace-nowrap">{format(new Date(row.dueDate), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span
                                                className={cn(
                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                    row.status === "paid" && "bg-green-500/10 text-green-400",
                                                    row.status === "issued" && "bg-amber-500/10 text-amber-400",
                                                    row.status === "draft" && "bg-white/5 text-muted",
                                                )}
                                            >
                                                {statusLabels[row.status]}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-foreground whitespace-nowrap">{money(row.total, row.currency)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {row.hasPdf && (
                                                    <button
                                                        onClick={() => download(row.id)}
                                                        disabled={downloadingId === row.id}
                                                        className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5"
                                                        title="Descarcă PDF"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
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
        </div>
    );
}
