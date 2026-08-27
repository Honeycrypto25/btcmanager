"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui/core";
import { ArrowLeft, Trash2, Sparkles, ScanText, ImageOff, Loader2, ExternalLink, Car, Receipt as ReceiptIcon, Undo2, Check, X, Landmark } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
    updateReceiptDetails,
    deleteReceipt,
    saveMerchantRule,
    runOcrOnReceipt,
    analyzeReceiptWithAI,
    backfillReceiptPreview,
    updateReceiptVehicleLink,
    convertReceiptToExpense,
    undoReceiptExpenseConversion,
    type ReceiptDetailsInput,
} from "@/app/actions/receipts";
import { confirmMatch, rejectMatch } from "@/app/actions/bank";

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
    vehicleId: string | null;
    vehicleMileage: number | null;
    fuelQuantityLitres: number | null;
    isFullTank: boolean | null;
    convertedExpenseId: string | null;
    matchedTransactionId: string | null;
    matchConfidence: number | null;
    suggestedTransaction: { id: string; transactionDate: string; description: string; amount: number } | null;
}

export function ReceiptDetailClient({ receipt, categories, vehicles }: { receipt: ReceiptData; categories: string[]; vehicles: { id: string; name: string }[] }) {
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

    const isAdmin = useIsAdmin();
    const [vehicleId, setVehicleId] = useState(receipt.vehicleId || "");
    const [vehicleMileage, setVehicleMileage] = useState(receipt.vehicleMileage?.toString() || "");
    const [fuelQuantityLitres, setFuelQuantityLitres] = useState(receipt.fuelQuantityLitres?.toString() || "");
    const [isFullTank, setIsFullTank] = useState(!!receipt.isFullTank);
    const [vehicleLinkSaved, setVehicleLinkSaved] = useState(false);
    const [vehicleLinkError, setVehicleLinkError] = useState<string | null>(null);
    const [ocrText, setOcrText] = useState(receipt.ocrRawText);
    const [convertedExpenseId, setConvertedExpenseId] = useState(receipt.convertedExpenseId);
    const [convertError, setConvertError] = useState<string | null>(null);
    const [matchState, setMatchState] = useState<{ status: string; suggestedTransaction: ReceiptData["suggestedTransaction"] }>({
        status: receipt.status,
        suggestedTransaction: receipt.suggestedTransaction,
    });
    const [matchActionPending, setMatchActionPending] = useState(false);

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

    function acceptSuggestedMatch() {
        if (!matchState.suggestedTransaction) return;
        setMatchActionPending(true);
        startTransition(async () => {
            try {
                await confirmMatch(matchState.suggestedTransaction!.id, receipt.id);
                setMatchState((prev) => ({ ...prev, status: "matched" }));
            } finally {
                setMatchActionPending(false);
            }
        });
    }

    function rejectSuggestedMatch() {
        if (!matchState.suggestedTransaction) return;
        setMatchActionPending(true);
        startTransition(async () => {
            try {
                await rejectMatch(matchState.suggestedTransaction!.id);
                setMatchState({ status: "unmatched", suggestedTransaction: null });
            } finally {
                setMatchActionPending(false);
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
            if (result.text) setOcrText(result.text);
            if (result.parsed) {
                const parsed = result.parsed;
                setForm((prev) => ({
                    ...prev,
                    merchant: parsed.merchant ?? prev.merchant,
                    receiptDate: parsed.receiptDate ?? prev.receiptDate,
                    receiptTime: parsed.receiptTime ?? prev.receiptTime,
                    amount: parsed.amount ?? prev.amount,
                    vatAmount: parsed.vatAmount ?? prev.vatAmount,
                    currency: parsed.currency ?? prev.currency,
                    paymentMethod: parsed.paymentMethod ?? prev.paymentMethod,
                }));
                // Fuel quantity belongs to the separate "link to vehicle"
                // section, not the main receipt form above.
                if (parsed.fuelQuantityLitres !== undefined) {
                    setFuelQuantityLitres(parsed.fuelQuantityLitres.toString());
                }
            }
        });
    }

    function analyzeWithAI() {
        startTransition(async () => {
            const result = await analyzeReceiptWithAI(receipt.id);
            setAssistMessage(result.message);
        });
    }

    function convertToExpense() {
        setConvertError(null);
        startTransition(async () => {
            try {
                // Persist whatever is currently in the form first, so the
                // expense is created from what's on screen, not stale DB
                // values from before the last edit.
                await updateReceiptDetails(receipt.id, form);
                const expense = await convertReceiptToExpense(receipt.id);
                setConvertedExpenseId(expense.id);
                setSaved(true);
            } catch (e: any) {
                setConvertError(e.message || "Nu s-a putut converti în cheltuială.");
            }
        });
    }

    function undoConvertToExpense() {
        if (!confirm("Anulezi conversia? Cheltuiala creată va fi ștearsă.")) return;
        setConvertError(null);
        startTransition(async () => {
            try {
                await undoReceiptExpenseConversion(receipt.id);
                setConvertedExpenseId(null);
            } catch (e: any) {
                setConvertError(e.message || "Nu s-a putut anula conversia.");
            }
        });
    }

    function saveVehicleLink() {
        setVehicleLinkError(null);
        setVehicleLinkSaved(false);
        startTransition(async () => {
            try {
                await updateReceiptVehicleLink(receipt.id, {
                    vehicleId: vehicleId || null,
                    vehicleMileage: vehicleMileage ? parseInt(vehicleMileage, 10) : null,
                    fuelQuantityLitres: fuelQuantityLitres ? parseFloat(fuelQuantityLitres) : null,
                    isFullTank,
                });
                setVehicleLinkSaved(true);
            } catch (e: any) {
                setVehicleLinkError(e.message || "Nu s-a putut salva legătura cu vehiculul.");
            }
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

            {matchState.status === "needs_review" && matchState.suggestedTransaction && (
                <Card className="p-4 sm:p-5 border-amber-400/30 bg-amber-500/[0.04]">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-300">
                            <Landmark className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground mb-0.5">Posibilă potrivire găsită în tranzacțiile bancare</p>
                            <p className="text-xs text-muted mb-3">
                                {new Date(matchState.suggestedTransaction.transactionDate).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}
                                {" · "}
                                {matchState.suggestedTransaction.description}
                                {" · "}
                                <span className="font-num text-foreground">£{matchState.suggestedTransaction.amount.toFixed(2)}</span>
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={acceptSuggestedMatch} disabled={matchActionPending}>
                                    {matchActionPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                                    Confirmă potrivirea
                                </Button>
                                <Button variant="outline" size="sm" onClick={rejectSuggestedMatch} disabled={matchActionPending}>
                                    <X className="w-3.5 h-3.5 mr-1.5" />
                                    Respinge
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {matchState.status === "matched" && matchState.suggestedTransaction && (
                <Card className="p-4 sm:p-5 border-green-400/30 bg-green-500/[0.04]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-green-400/30 bg-green-500/10 text-green-300">
                            <Check className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Potrivită cu o tranzacție bancară</p>
                            <p className="text-xs text-muted">
                                {new Date(matchState.suggestedTransaction.transactionDate).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}
                                {" · "}
                                {matchState.suggestedTransaction.description}
                                {" · "}
                                <span className="font-num text-foreground">£{matchState.suggestedTransaction.amount.toFixed(2)}</span>
                            </p>
                        </div>
                        <button onClick={rejectSuggestedMatch} disabled={matchActionPending} className="text-xs text-muted hover:text-foreground shrink-0">
                            Anulează
                        </button>
                    </div>
                </Card>
            )}

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
                    {isAdmin && (
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
                    )}
                    {assistMessage && <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">{assistMessage}</p>}

                    {ocrText && (
                        <div className="space-y-1">
                            <p className="text-xs text-muted">Text extras (OCR) — citește și completează manual câmpurile de mai jos:</p>
                            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-foreground bg-black/20 border border-border rounded-lg p-3">{ocrText}</pre>
                        </div>
                    )}

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

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border">
                        <div className="pt-3">
                            {convertedExpenseId ? (
                                <p className="text-xs text-green-400 flex items-center gap-1.5">
                                    <ReceiptIcon className="w-3.5 h-3.5" /> Adăugată la Cheltuieli.
                                </p>
                            ) : (
                                <p className="text-xs text-faint">Chitanța nu a fost adăugată încă la Cheltuieli.</p>
                            )}
                            {convertError && <p className="text-xs text-red-400 mt-1">{convertError}</p>}
                        </div>
                        {isAdmin && (
                            <div className="pt-3">
                                {convertedExpenseId ? (
                                    <Button variant="outline" size="sm" onClick={undoConvertToExpense} disabled={isPending}>
                                        <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Anulează conversia
                                    </Button>
                                ) : (
                                    <Button variant="outline" size="sm" onClick={convertToExpense} disabled={isPending || !form.amount || !form.receiptDate}>
                                        <ReceiptIcon className="w-3.5 h-3.5 mr-1.5" /> Convertește în cheltuială
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {isAdmin && (
                        <div className="flex gap-2 pt-2">
                            <Button variant="primary" onClick={save} disabled={isPending}>
                                {isPending ? "Se salvează..." : "Salvează"}
                            </Button>
                            <Button variant="danger" onClick={remove} disabled={isPending}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Șterge
                            </Button>
                        </div>
                    )}
                </Card>
            </div>

            {vehicles.length > 0 && (
                <Card className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Car className="w-4 h-4 text-muted" />
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Leagă de vehicul (opțional)</h3>
                    </div>
                    <p className="text-xs text-faint">
                        Utilă mai ales pentru combustibil plătit cash, care nu apare într-un extras bancar — kilometrajul și litrii de aici intră în
                        aceleași grafice de consum (MPG, cost/milă) ca și jurnalul de combustibil al vehiculului.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Vehicul</label>
                            <select
                                value={vehicleId}
                                onChange={(e) => setVehicleId(e.target.value)}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            >
                                <option value="" className="bg-surface">— Fără vehicul —</option>
                                {vehicles.map((v) => (
                                    <option key={v.id} value={v.id} className="bg-surface">{v.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Kilometraj</label>
                            <input
                                type="number"
                                value={vehicleMileage}
                                onChange={(e) => setVehicleMileage(e.target.value)}
                                disabled={!vehicleId}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Litri combustibil</label>
                            <input
                                type="number"
                                step="0.01"
                                value={fuelQuantityLitres}
                                onChange={(e) => setFuelQuantityLitres(e.target.value)}
                                disabled={!vehicleId}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                            />
                        </div>
                        <div className="flex items-end pb-3">
                            <label className="flex items-center gap-2 text-sm text-muted">
                                <input type="checkbox" checked={isFullTank} onChange={(e) => setIsFullTank(e.target.checked)} disabled={!vehicleId} className="accent-primary" />
                                Plin complet (necesar pentru MPG)
                            </label>
                        </div>
                    </div>
                    {vehicleLinkError && <p className="text-sm text-red-400">{vehicleLinkError}</p>}
                    {vehicleLinkSaved && <p className="text-sm text-green-400">Salvat.</p>}
                    {isAdmin && (
                        <Button variant="outline" size="sm" onClick={saveVehicleLink} disabled={isPending}>
                            Salvează legătura cu vehiculul
                        </Button>
                    )}
                </Card>
            )}
        </div>
    );
}
