import "server-only";
import Papa from "papaparse";
import crypto from "crypto";

/** Parses raw CSV text into headers + string rows. Works for any bank's
 * export — we never assume a fixed column layout, the caller supplies a
 * column mapping (see ColumnMapping below) chosen by the user. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    const result = Papa.parse<string[]>(text.trim(), {
        skipEmptyLines: true,
    });
    const data = result.data as string[][];
    if (data.length === 0) return { headers: [], rows: [] };
    const [headers, ...rows] = data;
    return { headers, rows };
}

export type AmountMode = "single" | "debit_credit";

export interface ColumnMapping {
    dateColumn: string;
    descriptionColumn: string;
    amountMode: AmountMode;
    // amountMode === "single": one signed (or unsigned + explicit sign convention) amount column
    amountColumn?: string;
    // amountMode === "debit_credit": separate columns, only one populated per row
    debitColumn?: string;
    creditColumn?: string;
    balanceColumn?: string;
}

export interface ParsedTransactionRow {
    transactionDate: Date;
    description: string;
    amount: number; // always positive
    debitCredit: "DEBIT" | "CREDIT";
    balance: number | null;
    rawRow: Record<string, string>;
}

/** Best-effort date parser covering the date formats most UK bank exports use. */
function parseDate(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
        const [, d, m, y] = dmy;
        const date = new Date(Number(y), Number(m) - 1, Number(d));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    // YYYY-MM-DD (ISO)
    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
        const [, y, m, d] = iso;
        const date = new Date(Number(y), Number(m) - 1, Number(d));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseAmount(value: string): number {
    const cleaned = value.replace(/[£$€,\s]/g, "").trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
}

/** Applies a user-chosen column mapping to raw CSV rows, producing normalized transactions. Rows that fail to parse (bad date, etc.) are skipped and reported. */
export function applyColumnMapping(
    headers: string[],
    rows: string[][],
    mapping: ColumnMapping
): { transactions: ParsedTransactionRow[]; skipped: number } {
    const indexOf = (col?: string) => (col ? headers.indexOf(col) : -1);

    const dateIdx = indexOf(mapping.dateColumn);
    const descIdx = indexOf(mapping.descriptionColumn);
    const amountIdx = indexOf(mapping.amountColumn);
    const debitIdx = indexOf(mapping.debitColumn);
    const creditIdx = indexOf(mapping.creditColumn);
    const balanceIdx = indexOf(mapping.balanceColumn);

    const transactions: ParsedTransactionRow[] = [];
    let skipped = 0;

    for (const row of rows) {
        const date = dateIdx >= 0 ? parseDate(row[dateIdx] ?? "") : null;
        const description = descIdx >= 0 ? (row[descIdx] ?? "").trim() : "";

        if (!date || !description) {
            skipped += 1;
            continue;
        }

        let amount = 0;
        let debitCredit: "DEBIT" | "CREDIT" = "DEBIT";

        if (mapping.amountMode === "single") {
            const raw = amountIdx >= 0 ? parseAmount(row[amountIdx] ?? "0") : 0;
            amount = Math.abs(raw);
            debitCredit = raw < 0 ? "DEBIT" : "CREDIT";
        } else {
            const debitVal = debitIdx >= 0 ? parseAmount(row[debitIdx] ?? "") : 0;
            const creditVal = creditIdx >= 0 ? parseAmount(row[creditIdx] ?? "") : 0;
            if (debitVal > 0) {
                amount = debitVal;
                debitCredit = "DEBIT";
            } else if (creditVal > 0) {
                amount = creditVal;
                debitCredit = "CREDIT";
            } else {
                skipped += 1;
                continue;
            }
        }

        const balance = balanceIdx >= 0 && row[balanceIdx] ? parseAmount(row[balanceIdx]) : null;

        const rawRow: Record<string, string> = {};
        headers.forEach((h, i) => (rawRow[h] = row[i] ?? ""));

        transactions.push({ transactionDate: date, description, amount, debitCredit, balance, rawRow });
    }

    return { transactions, skipped };
}

/** Collapses internal whitespace (including the literal tab some bank CSV
 * exports pad fixed-width fields with) down to single spaces, on top of
 * trimming the ends. Two descriptions of the SAME transaction can otherwise
 * differ only in whitespace between two import sources (e.g. a bank's CSV
 * export vs. its Open Banking API, which normalises spacing) and silently
 * defeat the hash-based dedup below, importing the same transaction twice. */
export function normalizeDescription(description: string): string {
    return description.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Stable per-user row hash — prevents importing the same transaction twice
 * even across separate CSV uploads (e.g. overlapping date ranges), AND
 * across import sources (CSV vs. the TrueLayer sync in
 * lib/bank/truelayer-sync.ts, which computes this exact same hash). */
export function computeRowHash(userId: string, row: ParsedTransactionRow): string {
    const key = `${userId}|${row.transactionDate.toISOString().slice(0, 10)}|${normalizeDescription(row.description)}|${row.amount.toFixed(2)}|${row.debitCredit}`;
    return crypto.createHash("sha256").update(key).digest("hex");
}
