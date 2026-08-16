"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui/core";
import { ArrowLeft, Trash2, Sparkles, ScanText, ImageOff, Loader2, ExternalLink } from "lucide-react";
import {
    updateReceiptDetails,
    deleteReceipt,
    saveMerchantRule,
    runOcrOnReceipt,
    analyzeReceiptWithAI,
    backfillReceiptPreview,
    type ReceiptDetailsInput,
} from "@/app/actions/receipts";

interface ReceiptData {
    id: string;
    merchant: string | null;
    receiptDate: string | null;
    receiptTime: string | null;
    amount: number | null;
    vatAmount: number | null;
    currency: string;
    category: string | null;
    description: string | null;
    paymentMethod: string | null;
    status: string;
    aiProcessed: boolean;
    ocrRawText: string | null;
    originalMimeType: string;
    hasPreview: boolean;
}

export function ReceiptDetailClient({ receipt, categories }: { receipt: ReceiptData; categories: string[] }) {
    const router = useRouter();
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageError, setImageError] = useState(false);
    const [originalUrl, setOriginalUrl] = useState<string | null>(null);
    const [form, setForm] = useState<ReceiptDetailsInput>({
        merchant: receipt.merchant || "",
        receiptDate: receipt.receiptDate ? receipt.receiptDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        receiptTime: receipt.receiptTime || "",
        amount: receipt.amount ?? undefined,
        vatAmount: receipt.vatAmount ?? undefined,
        currency: receipt.currency,
        category: receipt.category || categories[0],
        description: receipt.description || "",
        paymentMethod: receipt.paymentMethod || "",
    });
    const [rememberRule, setRememberRule] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [assistMessage, setAssistMessage] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/self-employed/receipts/${receipt.id}/file`)
            .then((res) => res.json())
            .then((data) => {
                if (data.url) setImageUrl(data.url);
                else setImageError(true);
            })
            .catch(() => setImageError(true));

        fetch(`/api/self-employed/receipts/${receipt.id}/file?variant=original`)
            .then((res) => res.json())
            .then((data) => {
                if (data.url) setOriginalUrl(data.url);
            })
            .catch(() => {});
    }, [receipt.id]);

    function save() {
        setError(null);
        setSaved(false);
        startTransition(async () => {
            try {
                await updateReceiptDetails(receipt.id, form);
                if (rememberRule && form.merchant && form.category) {
                    await saveMerchantRule(form.merchant, form.merchant, form.category);
                }
                setSaved(true);
            } catch (e: any) {
                setError(e.message || "Nu s-a putut salva.");
            }
        });
    }

    function remove() {
        if (!confirm("Ștergi definitiv această chitanță (inclusiv imaginea din R2)?")) return;
        startTransition(async () => {
            await deleteReceipt(receipt.id);
            router.push("/self-employed/receipts");
        });
    }

    function reloadImage() {
        setImageError(false);
        setImageUrl(null);
        fetch(`/api/self-employed/receipts/${receipt.id}/file`)
            .then((res) => res.json())
            .then((data) => {
                if (data.url) setImageUrl(data.url);
                else setImageError(true);
            })
            .catch(() => setImageError(true));
    }

    function generatePreview() {
        startTransition(async () => {
            const result = await backfillReceiptPreview(receipt.id);
            setAssistMessage(result.message);
            if (result.ok) reloadImage();
        });
    }

    function runOcr() {
        startTransition(async () => {
            const result = await runOcrOnReceipt(receipt.id);
            setAssistMessage(result.message);
        });
    }

    function analyzeWithAI() {
        startTransition(async () => {
            const result = await analyzeReceiptWithAI(receipt.id);
            setAssistMessage(result.message);
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={() => router.push("/self-employed/receipts")} className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-white/5">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Editează chitanța</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-3 flex flex-col items-center justify-center min-h-[320px] bg-black/20 gap-3">
                    {imageUrl && !imageError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={imageUrl}
                            alt="Chitanță"
                            className="max-h-[520px] w-auto rounded-lg object-contain"
                            onError={() => setImageError(true)}
                        />
                    ) : imageError || (imageUrl === null && !originalUrl) ? (
                        <div className="text-center text-faint">
                            <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Previzualizarea nu este disponibilă în browser pentru acest format.</p>
                        </div>
                    ) : (
                        <Loader2 className="w-6 h-6 text-muted animate-spin" />
                    )}
                    {originalUrl && (
                        <a
                            href={originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Vezi / descarcă fișierul original
                        </a>
                    )}
                </Card>

                <Card className="p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {["image/heic", "image/heif", "image/jpeg", "image/jpg", "image/png"].includes(receipt.originalMimeType) && !receipt.hasPreview && (
                            <Button variant="outline" size="sm" onClick={generatePreview} disabled={isPending}>
                                <ImageOff className="w-3.5 h-3.5 mr-2" />
                                Generează preview
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={runOcr} disabled={isPending}>
                            <ScanText className="w-3.5 h-3.5 mr-2" />
                            Rulează OCR
                        </Button>
                        <Button variant="outline" size="sm" onClick={analyzeWithAI} disabled={isPending}>
                            <Sparkles className="w-3.5 h-3.5 mr-2" />
                            Analyze with AI
                        </Button>
                    </div>
                    {assistMessage && <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">{assistMessage}</p>}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Comerciant</label>
                            <input
                                value={form.merchant}
                                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Categorie</label>
                            <select
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            >
                                {categories.map((c) => (
                                    <option key={c} value={c} className="bg-surface">
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data</label>
                            <input
                                type="date"
                                value={form.receiptDate}
                                onChange={(e) => setForm({ ...form, receiptDate: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Ora (opțional)</label>
                            <input
                                type="time"
                                value={form.receiptTime}
                                onChange={(e) => setForm({ ...form, receiptTime: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Sumă totală</label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.amount ?? ""}
                                onChange={(e) => setForm({ ...form, amount: e.target.value ? parseFloat(e.target.value) : undefined })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">TVA (opțional)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.vatAmount ?? ""}
                                onChange={(e) => setForm({ ...form, vatAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Monedă</label>
                            <input
                                value={form.currency}
                                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Metodă plată (opțional)</label>
                            <input
                                value={form.paymentMethod}
                                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs text-muted">Descriere (opțional)</label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                rows={2}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" checked={rememberRule} onChange={(e) => setRememberRule(e.target.checked)} className="accent-primary" />
                        Ține minte regula "{form.merchant || "comerciant"}" → "{form.category}" pentru chitanțele viitoare
                    </label>

                    {error && <p className="text-sm text-red-400">{error}</p>}
                    {saved && <p className="text-sm text-green-400">Salvat.</p>}

                    <div className="flex gap-2 pt-2">
                        <Button variant="primary" onClick={save} disabled={isPending}>
                            {isPending ? "Se salvează..." : "Salvează"}
                        </Button>
                        <Button variant="danger" onClick={remove} disabled={isPending}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Șterge
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
