"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, Button, cn } from "@/components/ui/core";
import { Camera, Upload, Receipt as ReceiptIcon, AlertTriangle, Loader2, X, List, BarChart3 } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface ReceiptRow {
    id: string;
    merchant: string | null;
    receiptDate: string | null;
    amount: number | null;
    currency: string;
    category: string | null;
    status: string;
    taxYear: string | null;
    convertedExpenseId: string | null;
    createdAt: string;
}

function formatMoney(amount: number | null, currency: string): string {
    if (amount === null) return "—";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

const STATUS_STYLES: Record<string, string> = {
    needs_review: "bg-amber-500/10 text-amber-300 border-amber-400/30",
    unmatched: "bg-white/[0.04] text-muted border-border",
    matched: "bg-green-500/10 text-green-300 border-green-400/30",
};
const STATUS_LABELS: Record<string, string> = {
    needs_review: "Posibilă potrivire",
    unmatched: "Nepotrivită",
    matched: "Potrivită",
};

function statusBadge(status: string) {
    return (
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider", STATUS_STYLES[status] || STATUS_STYLES.unmatched)}>
            {STATUS_LABELS[status] || status}
        </span>
    );
}

const tooltipStyle = { background: "#121210", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 };
const chartAxisProps = { stroke: "#8c8a80", fontSize: 12 };

function EmptyChartNote({ message }: { message: string }) {
    return <p className="text-sm text-faint italic py-16 text-center">{message}</p>;
}

type Tab = "list" | "stats";

export function ReceiptsClient({ initialReceipts, r2Configured, categories }: { initialReceipts: ReceiptRow[]; r2Configured: boolean; categories: string[] }) {
    const router = useRouter();
    const isAdmin = useIsAdmin();
    const [tab, setTab] = useState<Tab>("list");
    const [receipts] = useState(initialReceipts);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        let list = receipts;
        if (categoryFilter) list = list.filter((r) => r.category === categoryFilter);
        if (statusFilter) list = list.filter((r) => r.status === statusFilter);
        if (dateFrom) list = list.filter((r) => (r.receiptDate || r.createdAt).slice(0, 10) >= dateFrom);
        if (dateTo) list = list.filter((r) => (r.receiptDate || r.createdAt).slice(0, 10) <= dateTo);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((r) => (r.merchant || "").toLowerCase().includes(q));
        }
        return list;
    }, [receipts, categoryFilter, statusFilter, dateFrom, dateTo, search]);

    const hasActiveFilters = !!(categoryFilter || statusFilter || dateFrom || dateTo || search.trim());
    function clearFilters() {
        setCategoryFilter(null);
        setStatusFilter(null);
        setDateFrom("");
        setDateTo("");
        setSearch("");
    }

    async function handleFile(file: File) {
        setError(null);
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/self-employed/receipts", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload eșuat.");
            router.push(`/self-employed/receipts/${data.receipt.id}`);
        } catch (e: any) {
            setError(e.message || "A apărut o eroare la upload.");
            setUploading(false);
        }
    }

    function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = "";
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Chitanțe</span>
                    </h1>
                    <p className="text-muted text-sm">{receipts.length} chitanțe încărcate</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1">
                        {([
                            ["list", "Listă", List],
                            ["stats", "Statistici", BarChart3],
                        ] as const).map(([key, label, Icon]) => (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                                    tab === key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>
                    {tab === "list" && isAdmin && (
                        <div className="flex gap-2">
                            <Button variant="primary" onClick={() => cameraInputRef.current?.click()} disabled={uploading || !r2Configured}>
                                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                                Fotografiază
                            </Button>
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || !r2Configured}>
                                <Upload className="w-4 h-4 mr-2" />
                                Încarcă fișier
                            </Button>
                            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onInputChange} />
                            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onInputChange} />
                        </div>
                    )}
                </div>
            </div>

            {!r2Configured && (
                <Card className="p-4 border-amber-400/30 bg-amber-500/5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-amber-200 font-medium">Stocarea Cloudflare R2 nu este configurată</p>
                        <p className="text-xs text-amber-200/70 mt-1">
                            Uploadul de chitanțe e dezactivat până adaugi variabilele de mediu R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME în Vercel.
                        </p>
                    </div>
                </Card>
            )}

            {error && (
                <Card className="p-4 border-red-400/30 bg-red-500/5">
                    <p className="text-sm text-red-300">{error}</p>
                </Card>
            )}

            {tab === "list" ? (
                <>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setCategoryFilter(null)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${!categoryFilter ? "bg-primary text-black" : "bg-glass border border-border text-muted hover:text-foreground"}`}
                        >
                            Toate
                        </button>
                        {categories.map((c) => (
                            <button
                                key={c}
                                onClick={() => setCategoryFilter(c === categoryFilter ? null : c)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${categoryFilter === c ? "bg-primary text-black" : "bg-glass border border-border text-muted hover:text-foreground"}`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>

                    <Card className="p-3 sm:p-4">
                        <div className="flex flex-wrap items-end gap-3">
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
                            <div className="space-y-1">
                                <label className="text-[11px] text-muted uppercase tracking-wider">Status</label>
                                <select
                                    value={statusFilter || ""}
                                    onChange={(e) => setStatusFilter(e.target.value || null)}
                                    className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                >
                                    <option value="" className="bg-surface">Toate</option>
                                    <option value="needs_review" className="bg-surface">Posibilă potrivire</option>
                                    <option value="unmatched" className="bg-surface">Nepotrivită</option>
                                    <option value="matched" className="bg-surface">Potrivită</option>
                                </select>
                            </div>
                            <div className="flex-1 min-w-[160px] space-y-1">
                                <label className="text-[11px] text-muted uppercase tracking-wider">Caută comerciant</label>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="ex. Sainsbury's..."
                                    className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                />
                            </div>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="text-xs text-muted hover:text-red-400 pb-1.5 flex items-center gap-1">
                                    <X className="w-3.5 h-3.5" /> Șterge filtrele
                                </button>
                            )}
                            <span className="text-xs text-faint pb-1.5 ml-auto">
                                {filtered.length} din {receipts.length} chitanțe
                            </span>
                        </div>
                    </Card>

                    <Card className="overflow-hidden p-0 border-border">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border bg-white/[0.02]">
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Comerciant</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                        <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-16 text-center text-faint italic">
                                                <ReceiptIcon className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                                {receipts.length === 0 ? "Nicio chitanță încărcată încă." : "Nicio chitanță nu corespunde filtrelor."}
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((r) => (
                                            <tr
                                                key={r.id}
                                                onClick={() => router.push(`/self-employed/receipts/${r.id}`)}
                                                className="hover:bg-white/[0.01] transition-colors cursor-pointer"
                                            >
                                                <td className="px-6 py-4 text-sm text-foreground">
                                                    {r.receiptDate ? format(new Date(r.receiptDate), "dd MMM yyyy") : format(new Date(r.createdAt), "dd MMM yyyy")}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-foreground">{r.merchant || <span className="text-faint italic">De completat</span>}</td>
                                                <td className="px-6 py-4 text-sm text-muted">{r.category || "—"}</td>
                                                <td className="px-6 py-4 text-sm font-medium text-foreground">{formatMoney(r.amount, r.currency)}</td>
                                                <td className="px-6 py-4">{statusBadge(r.status)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            ) : (
                <StatsTab receipts={receipts} />
            )}
        </div>
    );
}

// --- Statistics tab ---

function StatsTab({ receipts }: { receipts: ReceiptRow[] }) {
    const monthly = useMemo(() => {
        const byMonth = new Map<string, { key: string; label: string; count: number; amount: number }>();
        for (const r of receipts) {
            const d = new Date(r.receiptDate || r.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const existing = byMonth.get(key) ?? { key, label: format(d, "MMM yyyy"), count: 0, amount: 0 };
            existing.count += 1;
            existing.amount += r.amount || 0;
            byMonth.set(key, existing);
        }
        return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
    }, [receipts]);

    const byTaxYear = useMemo(() => {
        const map = new Map<string, number>();
        for (const r of receipts) {
            const key = r.taxYear || "Fără an fiscal";
            map.set(key, (map.get(key) ?? 0) + (r.amount || 0));
        }
        return Array.from(map.entries())
            .map(([taxYear, amount]) => ({ taxYear, amount }))
            .sort((a, b) => a.taxYear.localeCompare(b.taxYear));
    }, [receipts]);

    const byCategory = useMemo(() => {
        const map = new Map<string, { category: string; amount: number; count: number }>();
        for (const r of receipts) {
            const key = r.category || "Fără categorie";
            const existing = map.get(key) ?? { category: key, amount: 0, count: 0 };
            existing.amount += r.amount || 0;
            existing.count += 1;
            map.set(key, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    }, [receipts]);

    const statusSummary = useMemo(() => {
        const total = receipts.length;
        const converted = receipts.filter((r) => r.convertedExpenseId).length;
        const matched = receipts.filter((r) => r.status === "matched").length;
        const needsReview = receipts.filter((r) => r.status === "needs_review").length;
        const unmatched = receipts.filter((r) => r.status === "unmatched" && !r.convertedExpenseId).length;
        return { total, converted, matched, needsReview, unmatched };
    }, [receipts]);

    if (receipts.length === 0) {
        return (
            <Card className="p-5 sm:p-6">
                <EmptyChartNote message="Nu există încă chitanțe încărcate pentru a genera statistici." />
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                    { label: "Total", value: statusSummary.total },
                    { label: "Convertite în cheltuială", value: statusSummary.converted },
                    { label: "Potrivite cu bancă", value: statusSummary.matched },
                    { label: "Posibilă potrivire", value: statusSummary.needsReview },
                    { label: "Nepotrivite", value: statusSummary.unmatched },
                ].map((s) => (
                    <Card key={s.label} className="p-4">
                        <p className="text-[11px] text-muted uppercase tracking-wider mb-1">{s.label}</p>
                        <p className="text-2xl font-display text-foreground">{s.value}</p>
                    </Card>
                ))}
            </div>

            <Card className="p-5 sm:p-6">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Chitanțe pe lună (număr și sumă)</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthly}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="label" {...chartAxisProps} />
                            <YAxis yAxisId="count" {...chartAxisProps} allowDecimals={false} />
                            <YAxis yAxisId="amount" orientation="right" {...chartAxisProps} tickFormatter={(v) => `£${v}`} />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                formatter={(v, name) => (name === "Sumă" ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(v)) : Number(v))}
                            />
                            <Legend />
                            <Bar yAxisId="count" dataKey="count" name="Număr chitanțe" fill="#7aa8d6" radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="amount" dataKey="amount" name="Sumă" fill="#d6a24c" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card className="p-5 sm:p-6">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Sumă pe an fiscal</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byTaxYear}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="taxYear" {...chartAxisProps} />
                            <YAxis {...chartAxisProps} tickFormatter={(v) => `£${v}`} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(v))} />
                            <Bar dataKey="amount" name="Sumă" fill="#d6a24c" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card className="overflow-hidden p-0 border-border">
                <div className="p-5 sm:p-6 pb-0">
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-1">Pe categorie</h3>
                </div>
                <div className="overflow-x-auto mt-4">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                <th className="px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Nr.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {byCategory.map((c) => (
                                <tr key={c.category} className="hover:bg-white/[0.01] transition-colors">
                                    <td className="px-6 py-3 text-sm text-foreground">{c.category}</td>
                                    <td className="px-6 py-3 text-sm font-medium text-foreground whitespace-nowrap">
                                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(c.amount)}
                                    </td>
                                    <td className="px-6 py-3 text-sm text-muted">{c.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
