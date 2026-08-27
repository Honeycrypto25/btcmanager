import "server-only";
import { db } from "@/lib/db";
import { findBestMatch, matchStatusForConfidence, type MatchableReceipt, type MatchableTransaction } from "@/lib/bank/matching";

/** Retroactively matches newly-inserted bank transactions against the
 * user's unmatched/needs-review receipts. Shared by the manual CSV import
 * flow (src/app/actions/bank.ts) and the automated TrueLayer sync
 * (src/lib/bank/truelayer-sync.ts) so both paths behave identically.
 *
 * Plain server-only module (not a "use server" actions file) on purpose —
 * it takes a caller-supplied userId with no session check of its own, so it
 * must never be reachable as a public Next.js server action. */
export async function runMatchingForTransactions(userId: string, transactionIds: string[]): Promise<number> {
    if (transactionIds.length === 0) return 0;

    // Only DEBIT transactions get matched against receipts (a receipt
    // represents money spent, not money received).
    const [transactions, candidateReceipts] = await Promise.all([
        db.bankTransaction.findMany({ where: { id: { in: transactionIds }, debitCredit: "DEBIT" } }),
        db.receipt.findMany({ where: { userId, status: { in: ["unmatched", "needs_review"] } } }),
    ]);

    const receiptCandidates: MatchableReceipt[] = candidateReceipts.map((r: { id: string; merchant: string | null; amount: unknown; receiptDate: Date | null; paymentMethod: string | null }) => ({
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
