"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { parseCsv, applyColumnMapping, computeRowHash, type ColumnMapping } from "@/lib/bank/csv";
import { scoreMatch, matchStatusForConfidence, type MatchableReceipt } from "@/lib/bank/matching";
import { runMatchingForTransactions } from "@/lib/bank/run-matching";
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

// --- TrueLayer (Open Banking) connections ---

export async function listBankConnections() {
    const userId = await requireUserId();
    return db.bankConnection.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function disconnectBankConnection(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.bankConnection.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    // Accounts created from this connection are kept (and their imported
    // transactions with them) — only the live sync is severed.
    await db.bankConnection.delete({ where: { id } });
    revalidatePath("/self-employed/bank");
}

export async function createBankAccount(name: string, currency?: string) {
    await requireAdmin();
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
    await requireAdmin();
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


/** Called after a receipt is created/edited with enough detail to match
 * (amount + date) — receipts are often uploaded before the bank statement
 * exists for them, so matching has to be re-triggered from this direction
 * too, not just after a CSV import. */
export async function matchReceiptAgainstTransactions(receiptId: string) {
    await requireAdmin();
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
    await requireAdmin();
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
    await requireAdmin();
    const userId = await requireUserId();
    const tx = await db.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.userId !== userId) throw new Error("Not found");
    const receipt = await db.receipt.findUnique({ where: { id: receiptId } });
    if (!receipt || receipt.userId !== userId) throw new Error("Chitanța nu a fost găsită.");

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

/** Receipts eligible to be manually linked to a bank transaction --
 * excludes anything already matched or already converted straight into an
 * expense. Used by the manual "Leagă chitanță" picker on unmatched
 * transactions, for cases the automatic amount-based matching in
 * lib/bank/matching.ts misses (e.g. a fuel receipt whose bank charge is
 * higher because a non-fuel item like a drink was bought in the same
 * transaction). */
export async function listReceiptsForManualMatch() {
    const userId = await requireUserId();
    const receipts = await db.receipt.findMany({
        where: { userId, status: { not: "matched" }, convertedExpenseId: null },
        orderBy: { receiptDate: "desc" },
        take: 200,
    });
    return receipts.map((r: any) => ({
        id: r.id,
        merchant: r.merchant,
        amount: r.amount !== null ? Number(r.amount) : null,
        receiptDate: r.receiptDate ? r.receiptDate.toISOString() : null,
        category: r.category,
    }));
}

export async function rejectMatch(transactionId: string) {
    await requireAdmin();
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

// --- Conversion into Income/Expenses ---

export interface ConvertToIncomeInput {
    description?: string;
    client?: string;
}

export async function convertTransactionToIncome(transactionId: string, input?: ConvertToIncomeInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const tx = await db.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.userId !== userId) throw new Error("Not found");
    if (tx.convertedType) throw new Error("Tranzacția este deja convertită.");

    const income = await db.selfEmployedIncome.create({
        data: {
            userId,
            date: tx.transactionDate,
            description: input?.description?.trim() || tx.description,
            client: input?.client?.trim() || null,
            amount: tx.amount,
            paymentMethod: "Transfer bancar",
            taxYear: tx.taxYear,
            bankTransactionId: tx.id,
        },
    });

    await db.bankTransaction.update({
        where: { id: transactionId },
        data: { convertedType: "income", convertedRecordId: income.id },
    });

    revalidatePath("/self-employed/bank");
    revalidatePath("/self-employed/income");
    revalidatePath("/self-employed");
    return income;
}

export interface ConvertToExpenseInput {
    merchant?: string;
    category: string;
}

export async function convertTransactionToExpense(transactionId: string, input: ConvertToExpenseInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const tx = await db.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.userId !== userId) throw new Error("Not found");
    if (tx.convertedType) throw new Error("Tranzacția este deja convertită.");

    const expense = await db.selfEmployedExpense.create({
        data: {
            userId,
            date: tx.transactionDate,
            merchant: input.merchant?.trim() || tx.description,
            amount: tx.amount,
            category: input.category,
            paymentMethod: "Transfer bancar",
            businessUsePercentage: 100,
            allowableExpenseStatus: "allowable",
            taxYear: tx.taxYear,
            bankTransactionId: tx.id,
            // Carry over a receipt the user manually (or automatically)
            // linked to this transaction, so the Expenses list can offer a
            // "View" link to it -- previously dropped here, so a manually
            // linked receipt looked unattached on the resulting expense.
            receiptId: tx.receiptId,
        },
    });

    await db.bankTransaction.update({
        where: { id: transactionId },
        data: { convertedType: "expense", convertedRecordId: expense.id },
    });

    // Mark the linked receipt itself as converted too, mirroring
    // convertReceiptToExpense -- otherwise the receipt detail page would
    // still offer its own "Convertește în cheltuială" button and a second,
    // duplicate expense could be created for the same purchase.
    if (tx.receiptId) {
        await db.receipt.update({ where: { id: tx.receiptId }, data: { convertedExpenseId: expense.id } });
        revalidatePath(`/self-employed/receipts/${tx.receiptId}`);
    }

    revalidatePath("/self-employed/bank");
    revalidatePath("/self-employed/expenses");
    revalidatePath("/self-employed/receipts");
    revalidatePath("/self-employed");
    return expense;
}

/** Marks a transaction as reviewed-but-personal, so it stops showing up as
 * an actionable item without creating an Income/Expense row for it. */
export async function ignoreTransaction(transactionId: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const tx = await db.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.userId !== userId) throw new Error("Not found");
    if (tx.convertedType) throw new Error("Tranzacția este deja convertită.");

    await db.bankTransaction.update({
        where: { id: transactionId },
        data: { convertedType: "ignored", convertedRecordId: null },
    });
    revalidatePath("/self-employed/bank");
}

/** Bulk version of ignoreTransaction, for the multi-select action bar.
 * Silently skips any transaction that's already converted (income/expense/
 * ignored) rather than failing the whole batch. */
export async function bulkIgnoreTransactions(transactionIds: string[]) {
    await requireAdmin();
    const userId = await requireUserId();
    if (transactionIds.length === 0) return { count: 0 };

    const result = await db.bankTransaction.updateMany({
        where: { id: { in: transactionIds }, userId, convertedType: null },
        data: { convertedType: "ignored", convertedRecordId: null },
    });
    revalidatePath("/self-employed/bank");
    return { count: result.count };
}

/** Bulk-assigns (or clears, if accountId is null) the bank account on a set
 * of transactions -- used by the multi-select "Atribuie cont" bulk action so
 * the user can tag a batch of rows (e.g. all personal-card spending) at
 * once instead of one at a time. */
export async function bulkAssignAccount(transactionIds: string[], accountId: string | null) {
    await requireAdmin();
    const userId = await requireUserId();
    if (transactionIds.length === 0) return { count: 0 };

    if (accountId) {
        const account = await db.bankAccount.findUnique({ where: { id: accountId } });
        if (!account || account.userId !== userId) throw new Error("Cont invalid.");
    }

    const result = await db.bankTransaction.updateMany({
        where: { id: { in: transactionIds }, userId },
        data: { accountId },
    });
    revalidatePath("/self-employed/bank");
    return { count: result.count };
}

/** Undoes a conversion — deletes the Income/Expense row it created (if any)
 * and clears the transaction's converted markers so it can be re-converted. */
export async function undoTransactionConversion(transactionId: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const tx = await db.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.userId !== userId) throw new Error("Not found");
    if (!tx.convertedType) return;

    if (tx.convertedType === "income" && tx.convertedRecordId) {
        await db.selfEmployedIncome.deleteMany({ where: { id: tx.convertedRecordId, userId } });
    } else if (tx.convertedType === "expense" && tx.convertedRecordId) {
        await db.selfEmployedExpense.deleteMany({ where: { id: tx.convertedRecordId, userId } });
        // Undo the receipt-side marker set by convertTransactionToExpense so
        // a linked receipt becomes convertible/matchable again instead of
        // being stuck "already converted" with no expense to show for it.
        if (tx.receiptId) {
            await db.receipt.update({ where: { id: tx.receiptId }, data: { convertedExpenseId: null } });
            revalidatePath(`/self-employed/receipts/${tx.receiptId}`);
        }
    }

    await db.bankTransaction.update({
        where: { id: transactionId },
        data: { convertedType: null, convertedRecordId: null },
    });

    revalidatePath("/self-employed/bank");
    revalidatePath("/self-employed/income");
    revalidatePath("/self-employed/expenses");
    revalidatePath("/self-employed/receipts");
    revalidatePath("/self-employed");
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
