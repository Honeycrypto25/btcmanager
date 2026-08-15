"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteReceiptObject, getReceiptObjectBuffer, buildReceiptPreviewKey, uploadReceiptObject } from "@/lib/r2/receipts";
import { getUkTaxYear, getDefaultRetentionUntil } from "@/lib/tax/uk-tax-year";
import { generateHeicPreview, isHeicMimeType } from "@/lib/receipts/preview";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface ReceiptDetailsInput {
    merchant?: string;
    receiptDate?: string; // ISO date
    receiptTime?: string;
    amount?: number;
    vatAmount?: number;
    currency?: string;
    category?: string;
    description?: string;
    paymentMethod?: string;
}

/** Saves user-entered/edited receipt details. Also applies a merchant rule
 * (if one exists) to prefill category when the merchant is set for the
 * first time and no category has been chosen yet. */
export async function updateReceiptDetails(id: string, input: ReceiptDetailsInput) {
    const userId = await requireUserId();
    const existing = await db.receipt.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const receiptDate = input.receiptDate ? new Date(input.receiptDate) : existing.receiptDate ?? undefined;
    const taxYear = receiptDate ? getUkTaxYear(receiptDate) : existing.taxYear;

    let category = input.category ?? existing.category;
    if (input.merchant && !input.category) {
        const rule = await findMerchantRule(userId, input.merchant);
        if (rule) category = rule.category;
    }

    const receipt = await db.receipt.update({
        where: { id },
        data: {
            merchant: input.merchant ?? existing.merchant,
            receiptDate: receiptDate ?? null,
            receiptTime: input.receiptTime ?? existing.receiptTime,
            amount: input.amount ?? existing.amount,
            vatAmount: input.vatAmount ?? existing.vatAmount,
            currency: input.currency ?? existing.currency,
            category,
            description: input.description ?? existing.description,
            paymentMethod: input.paymentMethod ?? existing.paymentMethod,
            taxYear: taxYear ?? undefined,
            retentionUntil: taxYear ? getDefaultRetentionUntil(taxYear) : existing.retentionUntil,
            status: existing.status === "needs_review" && input.merchant && input.amount ? "unmatched" : existing.status,
        },
    });

    revalidatePath("/self-employed/receipts");
    revalidatePath(`/self-employed/receipts/${id}`);
    return receipt;
}

/** Deletes the receipt row AND its R2 objects. Only ever called explicitly
 * by the user — receipts are never auto-deleted (see retention policy). */
export async function deleteReceipt(id: string) {
    const userId = await requireUserId();
    const existing = await db.receipt.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    await deleteReceiptObject(existing.originalObjectKey);
    if (existing.previewObjectKey) {
        await deleteReceiptObject(existing.previewObjectKey);
    }
    await db.receipt.delete({ where: { id } });

    revalidatePath("/self-employed/receipts");
}

export async function listReceipts(filter?: { taxYear?: string; status?: string }) {
    const userId = await requireUserId();
    return db.receipt.findMany({
        where: { userId, ...(filter?.taxYear ? { taxYear: filter.taxYear } : {}), ...(filter?.status ? { status: filter.status } : {}) },
        orderBy: { createdAt: "desc" },
    });
}

/** Backfills a WebP preview for a receipt uploaded before HEIC preview
 * generation existed (or whose conversion failed the first time). */
export async function backfillReceiptPreview(id: string): Promise<{ ok: boolean; message: string }> {
    const userId = await requireUserId();
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.userId !== userId) throw new Error("Not found");

    if (!isHeicMimeType(receipt.originalMimeType)) {
        return { ok: false, message: "Acest fișier nu este HEIC — nu are nevoie de preview." };
    }
    if (receipt.previewObjectKey) {
        return { ok: true, message: "Preview-ul există deja." };
    }

    const originalBuffer = await getReceiptObjectBuffer(receipt.originalObjectKey);
    const previewBuffer = await generateHeicPreview(originalBuffer);
    if (!previewBuffer) {
        return { ok: false, message: "Conversia a eșuat. Poți vedea în continuare fișierul original mai jos." };
    }

    const previewKey = buildReceiptPreviewKey({
        userId,
        taxYear: receipt.taxYear || getUkTaxYear(receipt.createdAt),
        date: receipt.receiptDate || receipt.createdAt,
        receiptId: receipt.id,
    });
    await uploadReceiptObject(previewKey, previewBuffer, "image/webp");
    await db.receipt.update({
        where: { id },
        data: { previewObjectKey: previewKey, previewFileSize: previewBuffer.length },
    });

    revalidatePath(`/self-employed/receipts/${id}`);
    return { ok: true, message: "Preview generat cu succes." };
}

export async function getReceipt(id: string) {
    const userId = await requireUserId();
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.userId !== userId) throw new Error("Not found");
    return receipt;
}

// --- Merchant rules ---

async function findMerchantRule(userId: string, merchant: string) {
    const rules = await db.merchantRule.findMany({ where: { userId } });
    const lower = merchant.toLowerCase();
    return rules.find((r: any) => lower.includes(r.matchText.toLowerCase())) ?? null;
}

/** Called when the user sets/corrects a merchant + category — remembers the
 * mapping so future receipts from the same merchant prefill automatically.
 * Simple substring rule, not machine learning, per spec. */
export async function saveMerchantRule(matchText: string, merchantNormalized: string, category: string) {
    const userId = await requireUserId();
    const rule = await db.merchantRule.upsert({
        where: { userId_matchText: { userId, matchText: matchText.toLowerCase() } },
        create: { userId, matchText: matchText.toLowerCase(), merchantNormalized, category },
        update: { merchantNormalized, category },
    });
    return rule;
}

export async function listMerchantRules() {
    const userId = await requireUserId();
    return db.merchantRule.findMany({ where: { userId }, orderBy: { merchantNormalized: "asc" } });
}

export async function deleteMerchantRule(id: string) {
    const userId = await requireUserId();
    const existing = await db.merchantRule.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.merchantRule.delete({ where: { id } });
}

// --- OCR / AI (stubs — architecture ready, not wired to a live provider yet) ---
// Tracked in /tasks under "Arhitectură OCR (Google Cloud Vision)" and
// "Buton opțional Analyze with AI" — both stay PLANNED until a provider is
// configured. These stubs let the UI show the buttons now without breaking.

export async function runOcrOnReceipt(_id: string): Promise<{ ok: false; message: string }> {
    await requireUserId();
    return { ok: false, message: "OCR nu este configurat încă. Adaugă datele manual — vezi pagina Tasks pentru status." };
}

export async function analyzeReceiptWithAI(_id: string): Promise<{ ok: false; message: string }> {
    await requireUserId();
    return { ok: false, message: "Analiza AI nu este configurată încă. Adaugă datele manual — vezi pagina Tasks pentru status." };
}
