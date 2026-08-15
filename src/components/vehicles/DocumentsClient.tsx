"use client";

import React, { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Upload, Trash2, ExternalLink, FileText, AlertTriangle } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";

interface DocumentRow {
    id: string;
    category: string;
    title: string;
    vehicleId: string | null;
    expiryDate: string | null;
    createdAt: string;
}

const CATEGORIES = ["Insurance", "MOT", "Warranty", "ID", "Contract", "Other"];

export function DocumentsClient({ initialDocuments, vehicles, r2Configured }: { initialDocuments: DocumentRow[]; vehicles: { id: string; name: string }[]; r2Configured: boolean }) {
    const [documents, setDocuments] = useState(initialDocuments);
    const [category, setCategory] = useState("Other");
    const [vehicleId, setVehicleId] = useState("");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
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
                { id: result.document.id, category: result.document.category, title: result.document.title, vehicleId: result.document.vehicleId, expiryDate: null, createdAt: new Date().toISOString() },
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

    const filtered = filterCategory === "all" ? documents : documents.filter((d) => d.category === filterCategory);
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
                    <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={uploading || !r2Configured}>
                        <Upload className="w-4 h-4 mr-2" /> {uploading ? "Se încarcă..." : "Încarcă document"}
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                </div>
                {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
            </Card>

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

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Titlu</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Vehicul</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Adăugat</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-faint italic">
                                        <FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Niciun document încă.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((d) => (
                                    <tr key={d.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{d.title}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{d.category}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{vehicleName(d.vehicleId)}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{format(new Date(d.createdAt), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => viewDocument(d.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => remove(d.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10" disabled={isPending}>
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
