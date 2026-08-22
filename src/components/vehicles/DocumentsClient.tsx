"use client";

import React, { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Upload, Trash2, ExternalLink, FileText, AlertTriangle, Pencil, Archive } from "lucide-react";
import { deleteDocument, updateDocumentDetails } from "@/app/actions/documents";
import { computeExpiryStatus, isPastRetention } from "@/lib/documents/lifecycle";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface DocumentRow {
    id: string;
    category: string;
    title: string;
    vehicleId: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    retentionUntil: string | null;
    notes: string | null;
    createdAt: string;
}

function expiryBadge(expiryDate: string | null) {
    const status = computeExpiryStatus(expiryDate ? new Date(expiryDate) : null);
    if (status === "none") return null;
    const styles: Record<string, string> = {
        red: "bg-red-500/10 text-red-300 border-red-400/30",
        amber: "bg-amber-500/10 text-amber-300 border-amber-400/30",
        green: "bg-green-500/10 text-green-300 border-green-400/30",
    };
    const labels: Record<string, string> = { red: "Expirat", amber: "Expiră curând", green: "Valabil" };
    return (
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", styles[status])}>
            {labels[status]}
        </span>
    );
}

const CATEGORIES = ["Insurance", "MOT", "Warranty", "ID", "Contract", "Other"];

export function DocumentsClient({ initialDocuments, vehicles, r2Configured }: { initialDocuments: DocumentRow[]; vehicles: { id: string; name: string }[]; r2Configured: boolean }) {
    const isAdmin = useIsAdmin();
    const [documents, setDocuments] = useState(initialDocuments);
    const [category, setCategory] = useState("Other");
    const [vehicleId, setVehicleId] = useState("");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const [pastRetentionOnly, setPastRetentionOnly] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [editingId, setEditingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleFile(file: File) {
        setError(null);
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("category", category);
            formData.append("title", file.name);
            if (vehicleId) formData.append("vehicleId", vehicleId);
            const res = await fetch("/api/documents", { method: "POST", body: formData });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Upload eșuat.");
            setDocuments((prev) => [
                {
                    id: result.document.id,
                    category: result.document.category,
                    title: result.document.title,
                    vehicleId: result.document.vehicleId,
                    issueDate: null,
                    expiryDate: null,
                    retentionUntil: null,
                    notes: null,
                    createdAt: new Date().toISOString(),
                },
                ...prev,
            ]);
        } catch (e: any) {
            setError(e.message || "A apărut o eroare la upload.");
        } finally {
            setUploading(false);
        }
    }

    async function viewDocument(id: string) {
        const res = await fetch(`/api/documents/${id}/file`);
        const data = await res.json();
        if (data.url) window.open(data.url, "_blank");
    }

    function remove(id: string) {
        if (!confirm("Ștergi acest document?")) return;
        startTransition(async () => {
            await deleteDocument(id);
            setDocuments((prev) => prev.filter((d) => d.id !== id));
        });
    }

    function saveDetails(
        id: string,
        details: { title: string; category: string; vehicleId: string; issueDate: string; expiryDate: string; retentionUntil: string; notes: string }
    ) {
        startTransition(async () => {
            await updateDocumentDetails(id, {
                title: details.title,
                category: details.category,
                vehicleId: details.vehicleId || null,
                issueDate: details.issueDate || null,
                expiryDate: details.expiryDate || null,
                retentionUntil: details.retentionUntil || null,
                notes: details.notes,
            });
            setDocuments((prev) =>
                prev.map((d) =>
                    d.id === id
                        ? {
                              ...d,
                              title: details.title,
                              category: details.category,
                              vehicleId: details.vehicleId || null,
                              issueDate: details.issueDate || null,
                              expiryDate: details.expiryDate || null,
                              retentionUntil: details.retentionUntil || null,
                              notes: details.notes || null,
                          }
                        : d
                )
            );
            setEditingId(null);
        });
    }

    const filtered = documents
        .filter((d) => filterCategory === "all" || d.category === filterCategory)
        .filter((d) => !pastRetentionOnly || isPastRetention(d.retentionUntil ? new Date(d.retentionUntil) : null));
    const pastRetentionCount = documents.filter((d) => isPastRetention(d.retentionUntil ? new Date(d.retentionUntil) : null)).length;
    const vehicleName = (id: string | null) => vehicles.find((v) => v.id === id)?.name || "—";

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Documente</span>
                    </h1>
                    <p className="text-muted text-sm">{documents.length} documente</p>
                </div>
            </div>

            {!r2Configured && (
                <Card className="p-4 border-amber-400/30 bg-amber-500/5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200">Stocarea Cloudflare R2 nu este configurată — uploadul e dezactivat până se adaugă variabilele de mediu R2_*.</p>
                </Card>
            )}

            <Card className="p-5 sm:p-6">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1">
                        <label className="text-xs text-muted">Categorie</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-white/[0.04] border border-border rounded-lg px-3 py-2.5 text-sm text-foreground">
                            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted">Vehicul (opțional)</label>
                        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="bg-white/[0.04] border border-border rounded-lg px-3 py-2.5 text-sm text-foreground">
                            <option value="">— Fără vehicul —</option>
                            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                    </div>
                    {isAdmin && (
                        <>
                            <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={uploading || !r2Configured}>
                                <Upload className="w-4 h-4 mr-2" /> {uploading ? "Se încarcă..." : "Încarcă document"}
                            </Button>
                            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                        </>
                    )}
                </div>
                {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1 w-fit">
                    {["all", ...CATEGORIES].map((c) => (
                        <button
                            key={c}
                            onClick={() => setFilterCategory(c)}
                            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", filterCategory === c ? "bg-primary text-black" : "text-muted hover:bg-white/5 hover:text-foreground")}
                        >
                            {c === "all" ? "Toate" : c}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setPastRetentionOnly((v) => !v)}
                    className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        pastRetentionOnly ? "bg-amber-500/10 border-amber-400/30 text-amber-300" : "bg-glass border-border text-muted hover:text-foreground"
                    )}
                >
                    <Archive className="w-3.5 h-3.5" />
                    Peste retenție ({pastRetentionCount})
                </button>
            </div>

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Titlu</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Vehicul</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Adăugat</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-faint italic">
                                        <FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Niciun document încă.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((d) => {
                                    const pastRetention = isPastRetention(d.retentionUntil ? new Date(d.retentionUntil) : null);
                                    return (
                                        <React.Fragment key={d.id}>
                                            <tr className="hover:bg-white/[0.01] transition-colors group">
                                                <td className="px-6 py-4 text-sm text-foreground">{d.title}</td>
                                                <td className="px-6 py-4 text-sm text-muted">{d.category}</td>
                                                <td className="px-6 py-4 text-sm text-muted">{vehicleName(d.vehicleId)}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {expiryBadge(d.expiryDate)}
                                                        {pastRetention && (
                                                            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
                                                                Peste retenție
                                                            </span>
                                                        )}
                                                        {!d.expiryDate && !d.retentionUntil && <span className="text-xs text-faint">—</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-muted">{format(new Date(d.createdAt), "dd MMM yyyy")}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {isAdmin && (
                                                            <button onClick={() => setEditingId(editingId === d.id ? null : d.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => viewDocument(d.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </button>
                                                        {isAdmin && (
                                                            <button onClick={() => remove(d.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10" disabled={isPending}>
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {editingId === d.id && (
                                                <tr className="bg-white/[0.02]">
                                                    <td colSpan={6} className="px-6 py-4">
                                                        <DocumentEditForm document={d} vehicles={vehicles} isPending={isPending} onCancel={() => setEditingId(null)} onSave={(details) => saveDetails(d.id, details)} />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function DocumentEditForm({
    document: doc,
    vehicles,
    isPending,
    onCancel,
    onSave,
}: {
    document: DocumentRow;
    vehicles: { id: string; name: string }[];
    isPending: boolean;
    onCancel: () => void;
    onSave: (details: { title: string; category: string; vehicleId: string; issueDate: string; expiryDate: string; retentionUntil: string; notes: string }) => void;
}) {
    const [title, setTitle] = useState(doc.title);
    const [category, setCategory] = useState(doc.category);
    const [vehicleId, setVehicleId] = useState(doc.vehicleId || "");
    const [issueDate, setIssueDate] = useState(doc.issueDate ? doc.issueDate.slice(0, 10) : "");
    const [expiryDate, setExpiryDate] = useState(doc.expiryDate ? doc.expiryDate.slice(0, 10) : "");
    const [retentionUntil, setRetentionUntil] = useState(doc.retentionUntil ? doc.retentionUntil.slice(0, 10) : "");
    const [notes, setNotes] = useState(doc.notes || "");

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-muted">Titlu</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Categorie</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                        {CATEGORIES.map((c) => <option key={c} value={c} className="bg-surface">{c}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Vehicul</label>
                    <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                        <option value="" className="bg-surface">— Fără vehicul —</option>
                        {vehicles.map((v) => <option key={v.id} value={v.id} className="bg-surface">{v.name}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Data emiterii</label>
                    <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Data expirării</label>
                    <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Păstrează până la (retenție)</label>
                    <input type="date" value={retentionUntil} onChange={(e) => setRetentionUntil(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted">Notițe</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
            <p className="text-[11px] text-faint">
                Data de retenție e doar informativă — marchează documentul ca „peste retenție” în listă, dar nu îl șterge niciodată automat.
            </p>
            <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => onSave({ title, category, vehicleId, issueDate, expiryDate, retentionUntil, notes })} disabled={isPending || !title.trim()}>
                    Salvează
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel}>
                    Renunță
                </Button>
            </div>
        </div>
    );
}
