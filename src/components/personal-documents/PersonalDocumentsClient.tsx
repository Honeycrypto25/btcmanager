"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import {
    Upload,
    Trash2,
    ExternalLink,
    FolderOpen,
    AlertTriangle,
    Pencil,
    Plus,
    ChevronDown,
    ChevronRight,
    Mail,
    X,
    Search,
    History,
} from "lucide-react";
import {
    updatePersonalDocumentDetails,
    deletePersonalDocument,
    deletePersonalDocumentVersion,
    getPersonalDocumentFileUrl,
    sharePersonalDocumentByEmail,
} from "@/app/actions/personal-documents";
import { pickActiveVersion, computeExpiryStatus, type ExpiryStatus } from "@/lib/documents/personal-lifecycle";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const CATEGORIES = ["Identitate", "Pașaport", "Licență", "Asigurare", "Certificat", "Altele"];

interface VersionRow {
    id: string;
    issueDate: string | null;
    expiryDate: string | null;
    originalMimeType: string;
    fileSize: number;
    createdAt: string;
}

interface DocumentRow {
    id: string;
    person: string;
    title: string;
    category: string;
    notes: string | null;
    createdAt: string;
    versions: VersionRow[];
}

function statusBadge(status: ExpiryStatus) {
    if (status === "none") return <span className="text-xs text-faint">—</span>;
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

function fmtSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PersonalDocumentsClient({
    initialDocuments,
    knownPersons,
    r2Configured,
}: {
    initialDocuments: DocumentRow[];
    knownPersons: string[];
    r2Configured: boolean;
}) {
    const isAdmin = useIsAdmin();
    const [documents, setDocuments] = useState(initialDocuments);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [newPerson, setNewPerson] = useState("");
    const [newTitle, setNewTitle] = useState("");
    const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
    const [newIssueDate, setNewIssueDate] = useState("");
    const [newExpiryDate, setNewExpiryDate] = useState("");
    const [newNotes, setNewNotes] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [personFilter, setPersonFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<ExpiryStatus | "">("");
    const [search, setSearch] = useState("");

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [addVersionForId, setAddVersionForId] = useState<string | null>(null);
    const [shareVersionId, setShareVersionId] = useState<string | null>(null);
    const [shareEmail, setShareEmail] = useState("");
    const [sharing, setSharing] = useState(false);
    const [shareMessage, setShareMessage] = useState<string | null>(null);

    const persons = useMemo(() => {
        const set = new Set<string>(knownPersons);
        for (const d of documents) set.add(d.person);
        return Array.from(set).sort();
    }, [documents, knownPersons]);

    const enriched = useMemo(
        () =>
            documents.map((d) => {
                const active = pickActiveVersion(d.versions.map((v) => ({ id: v.id, expiryDate: v.expiryDate ? new Date(v.expiryDate) : null, createdAt: new Date(v.createdAt) })));
                const activeVersion = active ? d.versions.find((v) => v.id === active.id) ?? null : null;
                const status = computeExpiryStatus(activeVersion?.expiryDate ? new Date(activeVersion.expiryDate) : null);
                return { ...d, activeVersion, status };
            }),
        [documents]
    );

    const filtered = useMemo(() => {
        let list = enriched;
        if (personFilter) list = list.filter((d) => d.person === personFilter);
        if (categoryFilter) list = list.filter((d) => d.category === categoryFilter);
        if (statusFilter) list = list.filter((d) => d.status === statusFilter);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((d) => d.title.toLowerCase().includes(q) || d.person.toLowerCase().includes(q) || d.category.toLowerCase().includes(q));
        }
        return [...list].sort((a, b) => {
            const ea = a.activeVersion?.expiryDate ? new Date(a.activeVersion.expiryDate).getTime() : Infinity;
            const eb = b.activeVersion?.expiryDate ? new Date(b.activeVersion.expiryDate).getTime() : Infinity;
            return ea - eb;
        });
    }, [enriched, personFilter, categoryFilter, statusFilter, search]);

    const hasActiveFilters = !!(personFilter || categoryFilter || statusFilter || search.trim());
    function clearFilters() {
        setPersonFilter("");
        setCategoryFilter("");
        setStatusFilter("");
        setSearch("");
    }

    async function createDocument(file: File) {
        setError(null);
        if (!newPerson.trim() || !newTitle.trim()) {
            setError("Completează persoana și titlul înainte de a încărca fișierul.");
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("person", newPerson.trim());
            formData.append("title", newTitle.trim());
            formData.append("category", newCategory);
            if (newIssueDate) formData.append("issueDate", newIssueDate);
            if (newExpiryDate) formData.append("expiryDate", newExpiryDate);
            if (newNotes) formData.append("notes", newNotes);
            const res = await fetch("/api/personal-documents", { method: "POST", body: formData });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Upload eșuat.");
            setDocuments((prev) => [
                {
                    id: result.document.id,
                    person: result.document.person,
                    title: result.document.title,
                    category: result.document.category,
                    notes: result.document.notes,
                    createdAt: new Date().toISOString(),
                    versions: result.document.versions.map((v: any) => ({
                        id: v.id,
                        issueDate: v.issueDate,
                        expiryDate: v.expiryDate,
                        originalMimeType: v.originalMimeType,
                        fileSize: v.fileSize,
                        createdAt: new Date().toISOString(),
                    })),
                },
                ...prev,
            ]);
            setShowForm(false);
            setNewPerson("");
            setNewTitle("");
            setNewCategory(CATEGORIES[0]);
            setNewIssueDate("");
            setNewExpiryDate("");
            setNewNotes("");
        } catch (e: any) {
            setError(e.message || "A apărut o eroare la upload.");
        } finally {
            setUploading(false);
        }
    }

    async function addVersion(documentId: string, file: File, issueDate: string, expiryDate: string) {
        setError(null);
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            if (issueDate) formData.append("issueDate", issueDate);
            if (expiryDate) formData.append("expiryDate", expiryDate);
            const res = await fetch(`/api/personal-documents/${documentId}/versions`, { method: "POST", body: formData });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Upload eșuat.");
            setDocuments((prev) =>
                prev.map((d) =>
                    d.id === documentId
                        ? {
                              ...d,
                              versions: [
                                  {
                                      id: result.version.id,
                                      issueDate: result.version.issueDate,
                                      expiryDate: result.version.expiryDate,
                                      originalMimeType: result.version.originalMimeType,
                                      fileSize: result.version.fileSize,
                                      createdAt: new Date().toISOString(),
                                  },
                                  ...d.versions,
                              ],
                          }
                        : d
                )
            );
            setAddVersionForId(null);
        } catch (e: any) {
            setError(e.message || "A apărut o eroare la upload.");
        } finally {
            setUploading(false);
        }
    }

    async function viewFile(versionId: string) {
        try {
            const url = await getPersonalDocumentFileUrl(versionId);
            window.open(url, "_blank", "noopener,noreferrer");
        } catch {
            alert("Nu s-a putut deschide fișierul.");
        }
    }

    function removeDocument(id: string) {
        if (!confirm("Ștergi acest document (toate versiunile lui)? Nu poate fi anulat.")) return;
        startTransition(async () => {
            await deletePersonalDocument(id);
            setDocuments((prev) => prev.filter((d) => d.id !== id));
        });
    }

    function removeVersion(documentId: string, versionId: string) {
        if (!confirm("Ștergi această versiune?")) return;
        startTransition(async () => {
            try {
                await deletePersonalDocumentVersion(versionId);
                setDocuments((prev) => prev.map((d) => (d.id === documentId ? { ...d, versions: d.versions.filter((v) => v.id !== versionId) } : d)));
            } catch (e: any) {
                alert(e.message || "Nu s-a putut șterge.");
            }
        });
    }

    function saveDetails(id: string, details: { person: string; title: string; category: string; notes: string }) {
        startTransition(async () => {
            await updatePersonalDocumentDetails(id, details);
            setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...details } : d)));
            setEditingId(null);
        });
    }

    async function sendShare() {
        if (!shareVersionId) return;
        setSharing(true);
        setShareMessage(null);
        try {
            const result = await sharePersonalDocumentByEmail(shareVersionId, shareEmail);
            if (result.ok) {
                setShareMessage("Trimis!");
                setTimeout(() => {
                    setShareVersionId(null);
                    setShareEmail("");
                    setShareMessage(null);
                }, 1200);
            } else {
                setShareMessage(result.error);
            }
        } finally {
            setSharing(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Documente</span>
                    </h1>
                    <p className="text-muted text-sm">
                        {filtered.length} din {documents.length} documente
                    </p>
                </div>
                {isAdmin && (
                    <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Document nou
                    </Button>
                )}
            </div>

            {!r2Configured && (
                <Card className="p-4 border-amber-400/30 bg-amber-500/5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200">Stocarea Cloudflare R2 nu este configurată — uploadul e dezactivat până se adaugă variabilele de mediu R2_*.</p>
                </Card>
            )}

            {showForm && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Document nou</h3>
                        <button onClick={() => setShowForm(false)} className="text-faint hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Persoană</label>
                            <input
                                list="known-persons"
                                value={newPerson}
                                onChange={(e) => setNewPerson(e.target.value)}
                                placeholder="ex. Sergiu, Eva..."
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary"
                            />
                            <datalist id="known-persons">
                                {persons.map((p) => (
                                    <option key={p} value={p} />
                                ))}
                            </datalist>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Titlu</label>
                            <input
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="ex. Licență Taxi"
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Categorie</label>
                            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary">
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c} className="bg-surface">{c}</option>
                                ))}
                            </select>
                        </div>
                        <div />
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data emiterii (opțional)</label>
                            <input type="date" value={newIssueDate} onChange={(e) => setNewIssueDate(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data expirării (opțional)</label>
                            <input type="date" value={newExpiryDate} onChange={(e) => setNewExpiryDate(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary" />
                        </div>
                    </div>
                    <div className="space-y-1 mt-4">
                        <label className="text-xs text-muted">Notițe (opțional)</label>
                        <textarea rows={2} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary" />
                    </div>
                    {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                    <div className="mt-4">
                        <Button
                            variant="primary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading || !r2Configured}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            {uploading ? "Se încarcă..." : "Alege fișier și încarcă"}
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) createDocument(f);
                                e.target.value = "";
                            }}
                        />
                    </div>
                </Card>
            )}

            <Card className="p-3 sm:p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Persoană</label>
                        <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary">
                            <option value="" className="bg-surface">Toate</option>
                            {persons.map((p) => (
                                <option key={p} value={p} className="bg-surface">{p}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Categorie</label>
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary">
                            <option value="" className="bg-surface">Toate</option>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c} className="bg-surface">{c}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Status</label>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ExpiryStatus | "")} className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary">
                            <option value="" className="bg-surface">Toate</option>
                            <option value="green" className="bg-surface">Valabil</option>
                            <option value="amber" className="bg-surface">Expiră curând</option>
                            <option value="red" className="bg-surface">Expirat</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[180px] space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Caută</label>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="titlu, persoană, categorie..."
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
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider w-8"></th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Titlu</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Persoană</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Expiră</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-faint italic">
                                        <FolderOpen className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        {documents.length === 0 ? "Niciun document încă." : "Niciun document nu corespunde filtrelor."}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((d) => (
                                    <React.Fragment key={d.id}>
                                        <tr className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-6 py-4">
                                                <button onClick={() => setExpandedId(expandedId === d.id ? null : d.id)} className="text-muted hover:text-foreground">
                                                    {expandedId === d.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-foreground font-medium">{d.title}</td>
                                            <td className="px-6 py-4 text-sm text-muted">{d.person}</td>
                                            <td className="px-6 py-4 text-sm text-muted">{d.category}</td>
                                            <td className="px-6 py-4 text-sm text-muted whitespace-nowrap">
                                                {d.activeVersion?.expiryDate ? format(new Date(d.activeVersion.expiryDate), "dd MMM yyyy") : "—"}
                                            </td>
                                            <td className="px-6 py-4">{statusBadge(d.status)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1.5">
                                                    {d.activeVersion && (
                                                        <>
                                                            <button onClick={() => viewFile(d.activeVersion!.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5" title="Deschide">
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setShareVersionId(d.activeVersion!.id);
                                                                    setShareEmail("");
                                                                    setShareMessage(null);
                                                                }}
                                                                className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5"
                                                                title="Trimite pe email"
                                                            >
                                                                <Mail className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {isAdmin && (
                                                        <>
                                                            <button onClick={() => setAddVersionForId(addVersionForId === d.id ? null : d.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5" title="Adaugă o versiune nouă (an nou)">
                                                                <History className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => setEditingId(editingId === d.id ? null : d.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5" title="Editează">
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => removeDocument(d.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10" disabled={isPending} title="Șterge">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {shareVersionId && d.versions.some((v) => v.id === shareVersionId) && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={7} className="px-6 py-4">
                                                    <div className="flex flex-wrap items-end gap-2">
                                                        <div className="space-y-1 flex-1 min-w-[220px]">
                                                            <label className="text-xs text-muted">Trimite documentul (link valabil 7 zile) la:</label>
                                                            <input
                                                                type="email"
                                                                value={shareEmail}
                                                                onChange={(e) => setShareEmail(e.target.value)}
                                                                placeholder="adresa@exemplu.com"
                                                                className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                                                            />
                                                        </div>
                                                        <Button variant="primary" size="sm" onClick={sendShare} disabled={sharing || !shareEmail.trim()}>
                                                            {sharing ? "Se trimite..." : "Trimite"}
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => setShareVersionId(null)}>
                                                            Renunță
                                                        </Button>
                                                        {shareMessage && <p className={cn("text-xs w-full", shareMessage === "Trimis!" ? "text-green-400" : "text-red-400")}>{shareMessage}</p>}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {editingId === d.id && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={7} className="px-6 py-4">
                                                    <DocumentEditForm document={d} persons={persons} isPending={isPending} onCancel={() => setEditingId(null)} onSave={(details) => saveDetails(d.id, details)} />
                                                </td>
                                            </tr>
                                        )}

                                        {addVersionForId === d.id && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={7} className="px-6 py-4">
                                                    <AddVersionForm uploading={uploading} onCancel={() => setAddVersionForId(null)} onSubmit={(file, issueDate, expiryDate) => addVersion(d.id, file, issueDate, expiryDate)} />
                                                </td>
                                            </tr>
                                        )}

                                        {expandedId === d.id && (
                                            <tr className="bg-white/[0.015]">
                                                <td colSpan={7} className="px-6 py-4">
                                                    <p className="text-xs text-muted mb-2 uppercase tracking-wider">Istoric versiuni ({d.versions.length})</p>
                                                    {d.notes && <p className="text-sm text-muted mb-3">{d.notes}</p>}
                                                    <div className="space-y-1.5">
                                                        {[...d.versions]
                                                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                                            .map((v) => (
                                                                <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                                                                    <div className="text-sm text-muted">
                                                                        {v.expiryDate ? (
                                                                            <>
                                                                                Expiră <span className="text-foreground">{format(new Date(v.expiryDate), "dd MMM yyyy")}</span>
                                                                            </>
                                                                        ) : (
                                                                            "Fără dată de expirare"
                                                                        )}
                                                                        {v.issueDate && <span className="text-faint"> · emis {format(new Date(v.issueDate), "dd MMM yyyy")}</span>}
                                                                        <span className="text-faint"> · {fmtSize(v.fileSize)}</span>
                                                                        {d.activeVersion?.id === v.id && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">activ</span>}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <button onClick={() => viewFile(v.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5" title="Deschide">
                                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        {isAdmin && d.versions.length > 1 && (
                                                                            <button onClick={() => removeVersion(d.id, v.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10" title="Șterge versiunea">
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
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
    persons,
    isPending,
    onCancel,
    onSave,
}: {
    document: DocumentRow;
    persons: string[];
    isPending: boolean;
    onCancel: () => void;
    onSave: (details: { person: string; title: string; category: string; notes: string }) => void;
}) {
    const [person, setPerson] = useState(doc.person);
    const [title, setTitle] = useState(doc.title);
    const [category, setCategory] = useState(doc.category);
    const [notes, setNotes] = useState(doc.notes || "");

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-muted">Persoană</label>
                    <input list="known-persons" value={person} onChange={(e) => setPerson(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Titlu</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Categorie</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c} className="bg-surface">{c}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted">Notițe</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => onSave({ person, title, category, notes })} disabled={isPending || !person.trim() || !title.trim()}>
                    Salvează
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel}>
                    Renunță
                </Button>
            </div>
        </div>
    );
}

function AddVersionForm({
    uploading,
    onCancel,
    onSubmit,
}: {
    uploading: boolean;
    onCancel: () => void;
    onSubmit: (file: File, issueDate: string, expiryDate: string) => void;
}) {
    const [issueDate, setIssueDate] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted">Încarcă renoirea (ex. licența pe anul următor) — devine versiunea activă dacă are expirarea cea mai recentă.</p>
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-muted">Data emiterii</label>
                    <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-muted">Data expirării</label>
                    <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    {file ? file.name : "Alege fișier"}
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button variant="primary" size="sm" onClick={() => file && onSubmit(file, issueDate, expiryDate)} disabled={uploading || !file}>
                    {uploading ? "Se încarcă..." : "Salvează versiunea"}
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel}>
                    Renunță
                </Button>
            </div>
        </div>
    );
}
