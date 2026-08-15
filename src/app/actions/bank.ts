"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseCsv, applyColumnMapping, computeRowHash, type ColumnMapping } from "@/lib/bank/csv";
import { findBestMatch, scoreMatch, matchStatusForConfidence, type MatchableReceipt, type MatchableTransaction } from "@/lib/bank/matching";
import { getUkTaxYear } from "@/lib/tax/uk-tax-year";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

// --- Bank accounts ---

export async function listBankAccounts() {
    const userId = await requireUserId();
    return db.bankAccount.findMany({ where: { userId }, orderBy: { name: "asc" } });
}

export async function createBankAccount(name: string, currency?: string) {
    const userId = await requireUserId();
    const account = await db.bankAccount.create({ data: { userId, name, currency: currency || null } });
    revalidatePath("/self-employed/bank");
    return account;
}

// --- CSV preview (client sends raw text so the server is the source of truth for the actual import) ---

export async function previewBankCsv(csvText: string) {
    await requireUserId();
    const { headers, rows } = parseCsv(csvText);
    return { headers, sampleRows: rows.slice(0, 5), totalRows: rows.length };
}

// --- Import ---

export interface ImportBankCsvInput {
    filename: string;
    csvText: string;
    mapping: ColumnMapping;
    bankAccountId?: string;
}

export async function importBankCsv(input: ImportBankCsvInput) {
    const userId = await requireUserId();
    const { headers, rows } = parseCsv(input.csvText);
    const { transactions, skipped } = applyColumnMapping(headers, rows, input.mapping);

    let importedCount = 0;
    let duplicateCount = skipped;

    const batch = await db.bankImportBatch.create({
        data: {
            userId,
            bankAccountId: input.bankAccountId || null,
            filename: input.filename,
            columnMapping: input.mapping as any,
            rowCount: rows.length,
            importedCount: 0,
            duplicateCount: 0,
        },
    });

    const insertedIds: string[] = [];

    for (const row of transactions) {
        const hash = computeRowHash(userId, row);
        const existing = await db.bankTransaction.findUnique({
            where: { userId_originalRowHash: { userId, originalRowHash: hash } },
        });
        if (existing) {
            duplicateCount += 1;
            continue;
        }

        const taxYear = getUkTaxYear(row.transactionDate);
        const created = await db.bankTransaction.create({
            data: {
                userId,
                accountId: input.bankAccountId || null,
                transactionDate: row.transactionDate,
                description: row.description,
                amount: row.amount,
                debitCredit: row.debitCredit,
                balance: row.balance,
                taxYear,
                importBatchId: batch.id,
                originalRowHash: hash,
            },
        });
        insertedIds.push(created.id);
        importedCount += 1;
    }

    await db.bankImportBatch.update({
        where: { id: batch.id },
        data: { importedCount, duplicateCount },
    });

    // Retroactive matching — only DEBIT transactions get matched against
    // receipts (a receipt represents money spent, not money received).
    let matchedCount = 0;
    if (insertedIds.length > 0) {
        matchedCount = await runMatchingForTransactions(userId, insertedIds);
    }

    revalidatePath("/self-employed/bank");
    return { batchId: batch.id, rowCount: rows.length, importedCount, duplicateCount, matchedCount };
}

async function runMatchingForTransactions(userId: string, transactionIds: string[]) {
    const [transactions, candidateReceipts] = await Promise.all([
        db.bankTransaction.findMany({ where: { id: { in: transactionIds }, debitCredit: "DEBIT" } }),
        db.receipt.findMany({ where: { userId, status: { in: ["unmatched", "needs_review"] } } }),
    ]);

    const receiptCandidates: MatchableReceipt[] = candidateReceipts.map((r: any) => ({
        id: r.id,
        merchant: r.merchant,
        amount: r.amount !== null ? Number(r.amount) : null,
        receiptDate: r.receiptDate,
        paymentMethod: r.paymentMethod,
    }));

    let matchedCount = 0;

    for (const tx of transactions) {
        const txCandidate: MatchableTransaction = {
            id: tx.id,
            description: tx.description,
            amount: Number(tx.amount),
            transactionDate: tx.transactionDate,
        };
        const best = findBestMatch(txCandidate, receiptCandidates);
        if (!best) continue;

        const status = matchStatusForConfidence(best.confidence);
        await db.bankTransaction.update({
            where: { id: tx.id },
            data: { receiptId: best.receiptId, matchConfidence: best.confidence, matchStatus: status },
        });
        await db.receipt.update({
            where: { id: best.receiptId },
            data: {
                matchedTransactionId: tx.id,
                matchConfidence: best.confidence,
                status: status === "matched" ? "matched" : "needs_review",
            },
        });

        // Remove this receipt from further candidacy in this batch so two
        // transactions don't both claim the same receipt.
        const idx = receiptCandidates.findIndex((r) => r.id === best.receiptId);
        if (idx >= 0) receiptCandidates.splice(idx, 1);

        matchedCount += 1;
    }

    return matchedCount;
}

/** Called after a receipt is created/edited with enough detail to match
 * (amount + date) — receipts are often uploaded before the bank statement
 * exists for them, so matching has to be re-triggered from this direction
 * too, not just after a CSV import. */
export async function matchReceiptAgainstTransactions(receiptId: string) {
    const userId = await requireUserId();
    const receipt = await db.receipt.findUnique({ where: { id: receiptId } });
    if (!receipt || receipt.userId !== userId) return;
    if (receipt.amount === null || receipt.receiptDate === null) return;
    if (receipt.status === "matched") return;

    const candidateTransactions = await db.bankTransaction.findMany({
        where: { userId, debitCredit: "DEBIT", matchStatus: "unmatched" },
    });

    const receiptCandidate: MatchableReceipt = {
        id: receipt.id,
        merchant: receipt.merchant,
        amount: Number(receipt.amount),
        receiptDate: receipt.receiptDate,
        paymentMethod: receipt.paymentMethod,
    };

    let best: { transactionId: string; confidence: number } | null = null;
    for (const tx of candidateTransactions) {
        const confidence = scoreMatch(receiptCandidate, {
            id: tx.id,
            description: tx.description,
            amount: Number(tx.amount),
            transactionDate: tx.transactionDate,
        });
        if (confidence >= 0.5 && (!best || confidence > best.confidence)) {
            best = { transactionId: tx.id, confidence };
        }
    }

    if (!best) return;

    const status = matchStatusForConfidence(best.confidence);
    await db.bankTransaction.update({
        where: { id: best.transactionId },
        data: { receiptId: receipt.id, matchConfidence: best.confidence, matchStatus: status },
    });
    await db.receipt.update({
        where: { id: receipt.id },
        data: {
            matchedTransactionId: best.transactionId,
            matchConfidence: best.confidence,
            status: status === "matched" ? "matched" : "needs_review",
        },
    });

    revalidatePath("/self-employed/bank");
    revalidatePath("/self-employed/receipts");
}

/** Re-runs matching across ALL unmatched transactions and receipts for the
 * user — useful after uploading a batch of receipts that predates an
 * already-imported statement, or after rejecting a bad match. */
export async function rerunMatching() {
    const userId = await requireUserId();
    const unmatchedTx = await db.bankTransaction.findMany({
        where: { userId, matchStatus: "unmatched", debitCredit: "DEBIT" },
        select: { id: true },
    });
    const matchedCount = await runMatchingForTransactions(userId, unmatchedTx.map((t: any) => t.id));
    revalidatePath("/self-employed/bank");
    return { matchedCount };
}

export async function confirmMatch(transactionId: string, receiptId: string) {
    const userId = await requireUserId();
    const tx = await db.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.userId !== userId) throw new Error("Not found");

    await db.bankTransaction.update({
        where: { id: transactionId },
        data: { receiptId, matchStatus: "matched", matchConfidence: 1 },
    });
    await db.receipt.update({
        where: { id: receiptId },
        data: { matchedTransactionId: transactionId, matchConfidence: 1, status: "matched" },
    });

    revalidatePath("/self-employed/bank");
    revalidatePath("/self-employed/receipts");
}

export async function rejectMatch(transactionId: string) {
    const userId = await requireUserId();
    const tx = await db.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.userId !== userId) throw new Error("Not found");

    if (tx.receiptId) {
        await db.receipt.update({
            where: { id: tx.receiptId },
            data: { matchedTransactionId: null, matchConfidence: null, status: "unmatched" },
        });
    }
    await db.bankTransaction.update({
        where: { id: transactionId },
        data: { receiptId: null, matchStatus: "unmatched", matchConfidence: null },
    });

    revalidatePath("/self-employed/bank");
    revalidatePath("/self-employed/receipts");
}

// --- Listing ---

export async function listBankTransactions(filter?: { taxYear?: string; matchStatus?: string }) {
    const userId = await requireUserId();
    return db.bankTransaction.findMany({
        where: {
            userId,
            ...(filter?.taxYear ? { taxYear: filter.taxYear } : {}),
            ...(filter?.matchStatus ? { matchStatus: filter.matchStatus } : {}),
        },
        orderBy: { transactionDate: "desc" },
    });
}

export async function listImportBatches() {
    const userId = await requireUserId();
    return db.bankImportBatch.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/** For the "possible match" review UI — the suggested receipt's display details. */
export async function getReceiptSummaries(ids: string[]) {
    const userId = await requireUserId();
    if (ids.length === 0) return [];
    const receipts = await db.receipt.findMany({ where: { userId, id: { in: ids } } });
    return receipts.map((r: any) => ({
        id: r.id,
        merchant: r.merchant,
        amount: r.amount !== null ? Number(r.amount) : null,
        receiptDate: r.receiptDate,
        category: r.category,
    }));
}
