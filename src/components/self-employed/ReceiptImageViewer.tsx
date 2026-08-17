"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, ImageOff, Loader2 } from "lucide-react";

interface ReceiptViewData {
    id: string;
    merchant: string | null;
    receiptDate: string | null;
    amount: number | null;
    currency: string;
    originalMimeType: string;
}

function formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

/** Minimal, read-only receipt photo viewer -- opened from a "View" link
 * (e.g. the Eye icon on Expenses rows) instead of the full editable receipt
 * detail page. Just the image (or PDF), a back link, and a small caption;
 * no form fields, no OCR/AI actions, nothing editable. */
export function ReceiptImageViewer({ receipt }: { receipt: ReceiptViewData }) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageError, setImageError] = useState(false);
    const [originalUrl, setOriginalUrl] = useState<string | null>(null);
    const isPdf = receipt.originalMimeType === "application/pdf";

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

    return (
        <div className="min-h-screen flex flex-col">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 border-b border-border bg-glass">
                <Link
                    href="/self-employed/expenses"
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Înapoi
                </Link>
                <div className="text-right min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{receipt.merchant || "Chitanță"}</p>
                    <p className="text-xs text-faint">
                        {receipt.receiptDate ? format(new Date(receipt.receiptDate), "dd MMM yyyy") : ""}
                        {receipt.amount !== null ? ` · ${formatMoney(receipt.amount, receipt.currency)}` : ""}
                    </p>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-black/20">
                {isPdf && imageUrl ? (
                    <iframe src={imageUrl} title="Chitanță" className="w-full h-[85vh] rounded-lg border border-border bg-white" />
                ) : imageUrl && !imageError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={imageUrl}
                        alt="Chitanță"
                        className="max-h-[85vh] max-w-full w-auto rounded-lg object-contain"
                        onError={() => setImageError(true)}
                    />
                ) : imageError ? (
                    <div className="text-center text-faint">
                        <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Previzualizarea nu este disponibilă în browser pentru acest format.</p>
                    </div>
                ) : (
                    <Loader2 className="w-6 h-6 text-muted animate-spin" />
                )}
            </div>

            {originalUrl && (
                <div className="px-4 py-3 sm:px-6 border-t border-border text-center">
                    <a
                        href={originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Vezi / descarcă fișierul original
                    </a>
                </div>
            )}
        </div>
    );
}
