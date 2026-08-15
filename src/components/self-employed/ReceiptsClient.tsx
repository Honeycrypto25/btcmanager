"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Camera, Upload, Receipt as ReceiptIcon, AlertTriangle, Loader2 } from "lucide-react";

interface ReceiptRow {
    id: string;
    merchant: string | null;
    receiptDate: string | null;
    amount: number | null;
    currency: string;
    category: string | null;
    status: string;
    createdAt: string;
}

function formatMoney(amount: number | null, currency: string): string {
    if (amount === null) return "—";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function statusBadge(status: string) {
    const styles: Record<string, string> = {
        needs_review: "bg-amber-500/10 text-amber-300 border-amber-400/30",
        unmatched: "bg-white/[0.04] text-muted border-border",
        matched: "bg-green-500/10 text-green-300 border-green-400/30",
    };
    const labels: Record<string, string> = {
        needs_review: "De completat",
        unmatched: "Nepotrivită",
        matched: "Potrivită",
    };
    return (
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider", styles[status] || styles.unmatched)}>
            {labels[status] || status}
        </span>
    );
}

export function ReceiptsClient({ initialReceipts, r2Configured }: { initialReceipts: ReceiptRow[]; r2Configured: boolean }) {
    const router = useRouter();
    const [receipts, setReceipts] = useState(initialReceipts);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                <div className="flex gap-2">
                    <Button variant="primary" onClick={() => cameraInputRef.current?.click()} disabled={uploading || !r2Configured}>
                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                        Fotografiază
                    </Button>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || !r2Configured}>
                        <Upload className="w-4 h-4 mr-2" />
                        Încarcă fișier
                    </Button>
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={onInputChange}
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={onInputChange}
                    />
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
                            {receipts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-faint italic">
                                        <ReceiptIcon className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Nicio chitanță încărcată încă.
                                    </td>
                                </tr>
                            ) : (
                                receipts.map((r) => (
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
        </div>
    );
}
