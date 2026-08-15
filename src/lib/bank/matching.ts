import "server-only";

/**
 * Receipt <-> bank transaction matching. Deliberately simple and
 * deterministic (no ML) — scores a handful of signals and turns the score
 * into one of three outcomes: matched (auto), possible_match (needs
 * confirmation), or left unmatched. Receipts may be uploaded before the
 * bank statement exists for them, so this always runs retroactively rather
 * than requiring a transaction to exist first.
 */

export interface MatchableReceipt {
    id: string;
    merchant: string | null;
    amount: number | null;
    receiptDate: Date | null;
    paymentMethod: string | null;
}

export interface MatchableTransaction {
    id: string;
    description: string;
    amount: number;
    transactionDate: Date;
}

export interface MatchResult {
    receiptId: string;
    transactionId: string;
    confidence: number; // 0..1
}

const AUTO_MATCH_THRESHOLD = 0.85;
const POSSIBLE_MATCH_THRESHOLD = 0.5;
const MAX_DATE_DIFF_DAYS = 5;

function normalize(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Token-overlap similarity (Jaccard on words) — good enough to tell "SHELL
 * SERVICE STATION LONDON" apart from "TESCO STORES 3257" without pulling in
 * a fuzzy-matching dependency. */
function textSimilarity(a: string, b: string): number {
    const tokensA = new Set(normalize(a).split(" ").filter((t) => t.length > 2));
    const tokensB = new Set(normalize(b).split(" ").filter((t) => t.length > 2));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let overlap = 0;
    for (const t of tokensA) if (tokensB.has(t)) overlap += 1;

    const union = new Set([...tokensA, ...tokensB]).size;
    return union > 0 ? overlap / union : 0;
}

function daysBetween(a: Date, b: Date): number {
    return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/** Scores a single receipt/transaction pair. Returns 0 if amount doesn't
 * roughly match (a hard requirement) or the date gap is too large. */
export function scoreMatch(receipt: MatchableReceipt, transaction: MatchableTransaction): number {
    if (receipt.amount === null || receipt.receiptDate === null) return 0;

    const amountDiff = Math.abs(receipt.amount - transaction.amount);
    const amountMatches = amountDiff < 0.01;
    if (!amountMatches) return 0; // amount is a hard filter — no partial credit

    const dateDiff = daysBetween(receipt.receiptDate, transaction.transactionDate);
    if (dateDiff > MAX_DATE_DIFF_DAYS) return 0;

    // Score components: amount match is required (above), date proximity and
    // merchant similarity are weighted signals on top of that.
    const dateScore = 1 - dateDiff / MAX_DATE_DIFF_DAYS; // 1.0 same day, 0 at the cutoff
    const merchantScore = receipt.merchant ? textSimilarity(receipt.merchant, transaction.description) : 0;

    // Amount match alone (same day, no merchant text) should already clear
    // the "possible match" bar — merchant similarity boosts confidence
    // toward auto-match rather than gating it entirely, since receipt
    // merchant names and bank statement descriptions often differ a lot
    // (e.g. "Shell" vs "SHELL SERVICE STATION LONDON").
    const score = 0.55 + dateScore * 0.25 + merchantScore * 0.2;
    return Math.min(score, 1);
}

/** For one transaction, finds the best-scoring unmatched receipt (if any candidate clears the "possible match" threshold). */
export function findBestMatch(
    transaction: MatchableTransaction,
    candidateReceipts: MatchableReceipt[]
): MatchResult | null {
    let best: MatchResult | null = null;

    for (const receipt of candidateReceipts) {
        const confidence = scoreMatch(receipt, transaction);
        if (confidence >= POSSIBLE_MATCH_THRESHOLD && (!best || confidence > best.confidence)) {
            best = { receiptId: receipt.id, transactionId: transaction.id, confidence };
        }
    }

    return best;
}

export function matchStatusForConfidence(confidence: number): "matched" | "possible_match" {
    return confidence >= AUTO_MATCH_THRESHOLD ? "matched" : "possible_match";
}
