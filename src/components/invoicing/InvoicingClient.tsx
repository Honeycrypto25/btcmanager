"use client";

import React, { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, Trash2, X, FileSignature, Download, Pencil, Eye, Search } from "lucide-react";
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
    const [viewingId, setViewingId] = useState<string | null>(null);

    const [statusFilter, setStatusFilter] = useState<Status | "">("");
    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const totalOutstanding = useMemo(
        () => invoices.filter((i) => i.status !== "paid").reduce((sum, i) => sum + i.total, 0),
        [invoices],
    );

    const filtered = useMemo(() => {
        let list = invoices;
        if (statusFilter) list = list.filter((i) => i.status === statusFilter);
        if (dateFrom) list = list.filter((i) => i.issueDate >= dateFrom);
        if (dateTo) list = list.filter((i) => i.issueDate <= dateTo);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(
                (i) => i.invoiceNumber.toLowerCase().includes(q) || i.clientName.toLowerCase().includes(q) || i.companyName.toLowerCase().includes(q),
            );
        }
        return list;
    }, [invoices, statusFilter, search, dateFrom, dateTo]);

    const hasActiveFilters = !!(statusFilter || search.trim() || dateFrom || dateTo);
    function clearFilters() {
        setStatusFilter("");
        setSearch("");
        setDateFrom("");
        setDateTo("");
    }

    const viewingInvoice = viewingId ? invoices.find((i) => i.id === viewingId) ?? null : null;

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
                        {filtered.length} din {invoices.length} facturi · Neîncasat {money(totalOutstanding, invoices[0]?.currency ?? "GBP")}
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

            {viewingInvoice && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Factura {viewingInvoice.invoiceNumber}</h3>
                        <button onClick={() => setViewingId(null)} className="text-faint hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
                        <p className="text-muted">Emitent: <span className="text-foreground">{viewingInvoice.companyName}</span></p>
                        <p className="text-muted">Client: <span className="text-foreground">{viewingInvoice.clientName}</span></p>
                        <p className="text-muted">Emisă: <span className="text-foreground">{format(new Date(viewingInvoice.issueDate), "dd MMM yyyy")}</span></p>
                        <p className="text-muted">Scadentă: <span className="text-foreground">{format(new Date(viewingInvoice.dueDate), "dd MMM yyyy")}</span></p>
                        <p className="text-muted">Regim TVA: <span className="text-foreground">{vatLabels[viewingInvoice.vatTreatment]}</span></p>
                        <p className="text-muted">Status: <span className="text-foreground">{statusLabels[viewingInvoice.status]}</span></p>
                    </div>

                    <table className="w-full text-left border-collapse mb-4">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="py-2 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Descriere</th>
                                <th className="py-2 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Cant.</th>
                                <th className="py-2 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Preț unitar</th>
                                <th className="py-2 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Sumă</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {viewingInvoice.items.map((item, i) => (
                                <tr key={i}>
                                    <td className="py-2 text-sm text-foreground">{item.description}</td>
                                    <td className="py-2 text-sm text-muted text-right">{item.quantity}</td>
                                    <td className="py-2 text-sm text-muted text-right whitespace-nowrap">{money(item.unitPrice, viewingInvoice.currency)}</td>
                                    <td className="py-2 text-sm text-foreground text-right whitespace-nowrap">{money(item.quantity * item.unitPrice, viewingInvoice.currency)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="text-sm text-muted space-y-1 mb-4 text-right">
                        <p>Subtotal: <span className="text-foreground">{money(viewingInvoice.subtotal, viewingInvoice.currency)}</span></p>
                        <p>TVA ({viewingInvoice.vatRate}%): <span className="text-foreground">{money(viewingInvoice.vatAmount, viewingInvoice.currency)}</span></p>
                        <p className="font-medium text-base">Total: <span className="text-foreground">{money(viewingInvoice.total, viewingInvoice.currency)}</span></p>
                    </div>

                    {viewingInvoice.notes.trim() && (
                        <p className="text-sm text-muted mb-4"><span className="text-faint">Notițe: </span>{viewingInvoice.notes}</p>
                    )}

                    <div className="flex gap-2">
                        {viewingInvoice.hasPdf ? (
                            <Button variant="secondary" onClick={() => download(viewingInvoice.id)} disabled={downloadingId === viewingInvoice.id}>
                                <Download className="w-4 h-4 mr-2" />
                                {downloadingId === viewingInvoice.id ? "Se deschide..." : "Deschide PDF"}
                            </Button>
                        ) : (
                            <p className="text-xs text-faint italic self-center">PDF-ul nu a fost încă generat pentru această factură — editeaz-o și salveaz-o o dată ca să se genereze.</p>
                        )}
                        {isAdmin && (
                            <Button variant="ghost" onClick={() => { setViewingId(null); openEdit(viewingInvoice); }}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Editează
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            <Card className="p-3 sm:p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Status</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as Status | "")}
                            className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                        >
                            <option value="" className="bg-surface">Toate</option>
                            {Object.entries(statusLabels).map(([value, label]) => (
                                <option key={value} value={value} className="bg-surface">{label}</option>
                            ))}
                        </select>
                    </div>
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
                    <div className="flex-1 min-w-[180px] space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Caută (nr., client, companie)</label>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="ex. TAC-0001, Ciocan..."
                                className="w-full bg-white/[0.04] border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                            />
                        </div>
                    </div>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="text-xs text-muted hover:text-red-400 pb-1.5 flex items-center gap-1">
                            <X className="w-3.5 h-3.5" /> Șterge filtrele
                        </button>
                    )}
                </div>
            </Card>

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
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-faint italic">
                                        <FileSignature className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        {invoices.length === 0 ? "Nicio factură încă." : "Nicio factură nu corespunde filtrelor."}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((row) => (
                                    <tr key={row.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground font-medium whitespace-nowrap">
                                            <button onClick={() => setViewingId(row.id)} className="hover:text-primary hover:underline text-left">
                                                {row.invoiceNumber}
                                            </button>
                                        </td>
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
                                            <div className="flex justify-end gap-1.5">
                                                <button onClick={() => setViewingId(row.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5" title="Vizualizează">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
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
                                                        <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5" title="Editează">
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => remove(row.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10" title="Șterge">
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
