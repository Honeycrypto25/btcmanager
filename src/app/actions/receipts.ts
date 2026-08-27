"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { deleteReceiptObject, getReceiptObjectBuffer, buildReceiptPreviewKey, uploadReceiptObject } from "@/lib/r2/receipts";
import { getUkTaxYear, getDefaultRetentionUntil } from "@/lib/tax/uk-tax-year";
import { generateHeicPreview, isHeicMimeType, generateStandardImagePreview, isRasterImageMimeType } from "@/lib/receipts/preview";
import { matchReceiptAgainstTransactions } from "@/app/actions/bank";
import { isVisionConfigured, runTextDetection } from "@/lib/ocr/google-vision";
import { parseReceiptOcrText, type ParsedReceiptFields } from "@/lib/receipts/parse-ocr-text";

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
    await requireAdmin();
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

    // Receipts are often added before the matching bank transaction has been
    // imported yet — now that this receipt has amount+date, see if an
    // already-imported transaction matches it.
    if (receipt.amount !== null && receipt.receiptDate !== null && receipt.status !== "matched") {
        await matchReceiptAgainstTransactions(id);
    }

    revalidatePath("/self-employed/receipts");
    revalidatePath(`/self-employed/receipts/${id}`);
    return receipt;
}

export interface ReceiptVehicleLinkInput {
    vehicleId?: string | null;
    vehicleMileage?: number | null;
    fuelQuantityLitres?: number | null;
    isFullTank?: boolean | null;
}

/** Links (or unlinks) a receipt to a vehicle — mainly for fuel bought with
 * cash, which never shows up in a bank statement and so has no other way
 * into the vehicle's MPG/cost-per-mile calculation. When vehicleMileage +
 * fuelQuantityLitres are both set, this receipt is picked up by
 * actions/vehicles.ts getFuelStats() alongside the fuel journal entries. */
export async function updateReceiptVehicleLink(id: string, input: ReceiptVehicleLinkInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.receipt.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    if (input.vehicleId) {
        const vehicle = await db.vehicle.findUnique({ where: { id: input.vehicleId } });
        if (!vehicle || vehicle.userId !== userId) throw new Error("Vehicle not found");
    }

    const receipt = await db.receipt.update({
        where: { id },
        data: {
            vehicleId: input.vehicleId === undefined ? existing.vehicleId : input.vehicleId,
            vehicleMileage: input.vehicleMileage === undefined ? existing.vehicleMileage : input.vehicleMileage,
            fuelQuantityLitres: input.fuelQuantityLitres === undefined ? existing.fuelQuantityLitres : input.fuelQuantityLitres,
            isFullTank: input.isFullTank === undefined ? existing.isFullTank : input.isFullTank,
        },
    });

    // Keep the vehicle's currentMileage in sync, same as fuel-journal entries.
    if (receipt.vehicleId && receipt.vehicleMileage) {
        const vehicle = await db.vehicle.findUnique({ where: { id: receipt.vehicleId } });
        if (vehicle && (vehicle.currentMileage ?? 0) < receipt.vehicleMileage) {
            await db.vehicle.update({ where: { id: receipt.vehicleId }, data: { currentMileage: receipt.vehicleMileage } });
        }
    }

    revalidatePath("/self-employed/receipts");
    revalidatePath(`/self-employed/receipts/${id}`);
    if (receipt.vehicleId) revalidatePath(`/vehicles/${receipt.vehicleId}`);
    return receipt;
}

/** Deletes the receipt row AND its R2 objects. Only ever called explicitly
 * by the user — receipts are never auto-deleted (see retention policy). */
export async function deleteReceipt(id: string) {
    await requireAdmin();
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

/** Backfills a WebP preview for a receipt uploaded before preview
 * generation existed for its format (or whose conversion failed the first
 * time) — covers both HEIC (browser-compatibility preview) and JPEG/PNG
 * (storage-size-optimization preview). */
export async function backfillReceiptPreview(id: string): Promise<{ ok: boolean; message: string }> {
    await requireAdmin();
    const userId = await requireUserId();
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.userId !== userId) throw new Error("Not found");

    const isHeic = isHeicMimeType(receipt.originalMimeType);
    const isRaster = isRasterImageMimeType(receipt.originalMimeType);
    if (!isHeic && !isRaster) {
        return { ok: false, message: "Acest tip de fișier nu are preview generat automat (ex. PDF)." };
    }
    if (receipt.previewObjectKey) {
        return { ok: true, message: "Preview-ul există deja." };
    }

    const originalBuffer = await getReceiptObjectBuffer(receipt.originalObjectKey);
    const previewBuffer = isHeic ? await generateHeicPreview(originalBuffer) : await generateStandardImagePreview(originalBuffer);
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

    // When the automatic matcher found a candidate but wasn't confident
    // enough to auto-confirm (status === "needs_review"), matchedTransactionId
    // already points at that candidate — surface it so the receipt page can
    // show a "suggested match, confirm or reject" prompt right where the
    // user is looking, instead of making them go find it in the Bank tab.
    const suggestedTransaction = receipt.matchedTransactionId
        ? await db.bankTransaction.findUnique({ where: { id: receipt.matchedTransactionId } })
        : null;

    return { ...receipt, suggestedTransaction };
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
    await requireAdmin();
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
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.merchantRule.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.merchantRule.delete({ where: { id } });
}

// --- OCR (live via Google Cloud Vision, once GOOGLE_VISION_CLIENT_EMAIL /
// GOOGLE_VISION_PRIVATE_KEY are configured — see lib/ocr/google-vision.ts)
// / AI (still architecture-only — see runAnalyzeReceiptWithAI stub below) ---

export async function runOcrOnReceipt(id: string): Promise<{ ok: boolean; message: string; text?: string; parsed?: ParsedReceiptFields }> {
    await requireAdmin();
    const userId = await requireUserId();
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.userId !== userId) throw new Error("Not found");

    if (!isVisionConfigured()) {
        return { ok: false, message: "OCR nu este configurat încă. Adaugă datele manual — vezi pagina Tasks pentru status." };
    }

    if (receipt.originalMimeType === "application/pdf") {
        return { ok: false, message: "OCR nu este disponibil pentru fișiere PDF momentan — funcționează doar pe imagini." };
    }

    // Vision doesn't accept HEIC directly — use the already-generated
    // JPEG/WebP preview instead, if one exists.
    const objectKey = isHeicMimeType(receipt.originalMimeType) ? receipt.previewObjectKey : receipt.originalObjectKey;
    if (!objectKey) {
        return { ok: false, message: "Nu există o imagine compatibilă pentru OCR — generează mai întâi un preview." };
    }

    const buffer = await getReceiptObjectBuffer(objectKey);
    const text = await runTextDetection(buffer);

    if (!text) {
        return { ok: false, message: "OCR nu a găsit text în imagine (sau cererea către Google a eșuat) — adaugă datele manual." };
    }

    const parsed = parseReceiptOcrText(text);
    const filledCount = Object.keys(parsed).length;

    await db.receipt.update({ where: { id }, data: { ocrRawText: text } });
    revalidatePath(`/self-employed/receipts/${id}`);

    return {
        ok: true,
        message:
            filledCount > 0
                ? `OCR completat — am completat automat ${filledCount} câmp${filledCount > 1 ? "uri" : ""} din text. Verifică și corectează dacă e nevoie, apoi salvează.`
                : `OCR completat — ${text.length} caractere extrase, dar nu am putut identifica automat câmpurile. Citește textul de mai jos și completează manual.`,
        text,
        parsed,
    };
}

export async function analyzeReceiptWithAI(_id: string): Promise<{ ok: false; message: string }> {
    await requireAdmin();
    await requireUserId();
    return { ok: false, message: "Analiza AI nu este configurată încă. Adaugă datele manual — vezi pagina Tasks pentru status." };
}

// --- Convert to expense ---
// Mirrors actions/bank.ts convertTransactionToExpense -- the equivalent
// path for receipts that never appear in a bank statement (mainly cash
// purchases, like fuel bought with cash and linked to a vehicle above).
// Without this, such receipts had no way into the Expenses ledger at all.

export interface ConvertedExpenseResult {
    id: string;
    date: string;
    merchant: string;
    amount: number;
    vatAmount: number | null;
    category: string;
    alreadyConverted: boolean;
}

export async function convertReceiptToExpense(id: string): Promise<ConvertedExpenseResult> {
    await requireAdmin();
    const userId = await requireUserId();
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.userId !== userId) throw new Error("Not found");

    // Idempotent: if this receipt was already converted (e.g. a double
    // click, or a stale client retrying after the first click already
    // succeeded), just return the existing expense instead of throwing --
    // an uncaught throw here was surfacing to the user as a generic
    // "Server Components render" error instead of a helpful message.
    if (receipt.convertedExpenseId) {
        const existing = await db.selfEmployedExpense.findUnique({ where: { id: receipt.convertedExpenseId } });
        if (existing) {
            return {
                id: existing.id,
                date: existing.date.toISOString(),
                merchant: existing.merchant,
                amount: Number(existing.amount),
                vatAmount: existing.vatAmount !== null ? Number(existing.vatAmount) : null,
                category: existing.category,
                alreadyConverted: true,
            };
        }
        // The expense was deleted out from under us (e.g. manually from
        // Expenses) -- clear the stale marker and fall through to re-create it.
        await db.receipt.update({ where: { id }, data: { convertedExpenseId: null } });
    }

    if (receipt.amount === null) throw new Error("Chitanța nu are o sumă completată — adaugă suma înainte de a converti.");
    if (!receipt.receiptDate) throw new Error("Chitanța nu are o dată completată — adaugă data înainte de a converti.");

    const taxYear = receipt.taxYear || getUkTaxYear(receipt.receiptDate);

    const expense = await db.selfEmployedExpense.create({
        data: {
            userId,
            date: receipt.receiptDate,
            merchant: receipt.merchant || "Necunoscut",
            description: receipt.description,
            amount: receipt.amount,
            vatAmount: receipt.vatAmount,
            category: receipt.category || "Other",
            paymentMethod: receipt.paymentMethod,
            taxYear,
            receiptId: receipt.id,
        },
    });

    await db.receipt.update({ where: { id }, data: { convertedExpenseId: expense.id } });

    revalidatePath("/self-employed/receipts");
    revalidatePath(`/self-employed/receipts/${id}`);
    revalidatePath("/self-employed/expenses");
    revalidatePath("/self-employed");

    return {
        id: expense.id,
        date: expense.date.toISOString(),
        merchant: expense.merchant,
        amount: Number(expense.amount),
        vatAmount: expense.vatAmount !== null ? Number(expense.vatAmount) : null,
        category: expense.category,
        alreadyConverted: false,
    };
}

/** Undoes a conversion -- deletes the Expense row it created and clears
 * the receipt's converted marker so it can be edited/re-converted. */
export async function undoReceiptExpenseConversion(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.userId !== userId) throw new Error("Not found");
    if (!receipt.convertedExpenseId) return;

    await db.selfEmployedExpense.deleteMany({ where: { id: receipt.convertedExpenseId, userId } });
    await db.receipt.update({ where: { id }, data: { convertedExpenseId: null } });

    revalidatePath("/self-employed/receipts");
    revalidatePath(`/self-employed/receipts/${id}`);
    revalidatePath("/self-employed/expenses");
    revalidatePath("/self-employed");
}
