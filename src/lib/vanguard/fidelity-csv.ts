import "server-only";
import Papa from "papaparse";

export interface FidelityAssetRow {
    holdingName: string;
    quantity: number | null;
    valueGBP: number | null;
    bookCostGBP: number | null;
    currency: string;
}

export interface FidelityAccountBlock {
    accountNumber: string;
    product: string;
    holder: string | null;
    currency: string;
    valueGBP: number | null;
    cashAvailableGBP: number | null;
    assets: FidelityAssetRow[];
}

const HEADER_PREFIX = "Type,Holdings,Account number";
const SECTION_MARKER = "View all account details";

function toNumber(v: string | undefined): number | null {
    if (v === undefined) return null;
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
}

function parseCsvLine(line: string): string[] {
    const result = Papa.parse<string[]>(line);
    return (result.data[0] as string[]) ?? [];
}

/**
 * Parses the "View all account details" section of a Fidelity "Account
 * summary" CSV export -- the one section that lists every account by its
 * real account number. Each Account row is optionally followed by its
 * holding rows (Type=Asset), the same pairing already visible in the
 * export's combined "View all investment details" section (an Account
 * summary row immediately followed by an Asset "Cash" row for the same
 * money). A brand-new/pending account has no non-cash Asset row yet --
 * all its value sits in cashAvailableGBP -- so callers should treat
 * "no asset with quantity > 0" as "nothing invested yet", not an error.
 *
 * Fidelity's own export uses \r\n line endings and a UTF-8 BOM; both are
 * handled by the caller/here without needing pre-cleaning.
 */
export function parseFidelityAccountDetails(csvText: string): FidelityAccountBlock[] {
    const text = csvText.replace(/^﻿/, "");
    const lines = text.split(/\r?\n/);

    const sectionStart = lines.findIndex((l) => l.trim() === SECTION_MARKER);
    if (sectionStart === -1) return [];

    const headerIdx = lines.findIndex((l, i) => i > sectionStart && l.startsWith(HEADER_PREFIX));
    if (headerIdx === -1) return [];

    const headerCols = parseCsvLine(lines[headerIdx]).map((h) => h.trim());
    const col = (name: string) => headerCols.indexOf(name);

    const idxType = col("Type");
    const idxHoldings = col("Holdings");
    const idxAccountNumber = col("Account number");
    const idxProduct = col("Product");
    const idxHolder = col("Account holder");
    const idxQuantity = col("Quantity");
    const idxValue = col("Value (£)");
    const idxCurrency = col("Currency");
    const idxCashAvailable = col("Cash available");
    const idxBookCost = col("Book cost (£)");

    const blocks: FidelityAccountBlock[] = [];
    let current: FidelityAccountBlock | null = null;

    for (let i = headerIdx + 1; i < lines.length; i++) {
        const raw = lines[i];
        if (raw.trim() === "") break; // section ends at the first blank line
        const row = parseCsvLine(raw);
        const type = row[idxType]?.trim();

        if (type === "Account") {
            const accountNumber = row[idxAccountNumber]?.trim();
            if (!accountNumber) continue; // aggregate/no-account-number rows aren't real accounts
            current = {
                accountNumber,
                product: row[idxProduct]?.trim() || "Cont",
                holder: row[idxHolder]?.trim() || null,
                currency: row[idxCurrency]?.trim() || "GBP",
                valueGBP: toNumber(row[idxValue]),
                cashAvailableGBP: toNumber(row[idxCashAvailable]),
                assets: [],
            };
            blocks.push(current);
        } else if (type === "Asset" && current) {
            current.assets.push({
                holdingName: row[idxHoldings]?.trim() || "",
                quantity: toNumber(row[idxQuantity]),
                valueGBP: toNumber(row[idxValue]),
                bookCostGBP: toNumber(row[idxBookCost]),
                currency: row[idxCurrency]?.trim() || current.currency,
            });
        }
    }

    return blocks;
}

// --- "Transaction history" export ---

export type FidelityCsvKind = "accountSummary" | "transactionHistory" | "unknown";

const TX_HEADER_PREFIX = "Order date,";

/** Tells the two Fidelity CSV exports apart by their content, not the
 * file name (Fidelity numbers them "AccountSummary 8.csv",
 * "TransactionHistory 4.csv", and a renamed file should still work). */
export function detectFidelityCsvKind(csvText: string): FidelityCsvKind {
    const lines = csvText.replace(/^﻿/, "").split(/\r?\n/);
    if (lines.some((l) => l.startsWith(TX_HEADER_PREFIX))) return "transactionHistory";
    if (lines.some((l) => l.trim() === SECTION_MARKER)) return "accountSummary";
    return "unknown";
}

export interface FidelityBuyTransaction {
    /** Order (trade) date, YYYY-MM-DD. */
    date: string;
    accountNumber: string;
    productWrapper: string;
    investmentName: string;
    amountGBP: number;
    /** Units derived as amount ÷ price (6 dp) -- Fidelity's own Quantity
     * column is rounded to 2 dp (0.09 for what is really 0.0842 units),
     * which would drift the running total noticeably on small buys. */
    units: number;
    pricePerUnit: number;
    reference: string;
}

const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "07 Oct 2026" -> "2026-10-07"; also accepts dd/mm/yyyy. */
function parseFidelityDate(v: string | undefined): string | null {
    const t = (v ?? "").trim();
    let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/);
    if (m) {
        const mm = MONTHS[m[2].toLowerCase()];
        return mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
    }
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
}

/**
 * Parses a Fidelity "Transaction history" CSV export into fund purchases.
 *
 * Only rows whose Transaction type starts with "Buy" (e.g. "Buy From
 * Regular Savings Plan", "Buy") on a non-cash investment count as a
 * purchase. "Cash In …", "Cash Out For Buy" and "Tax Relief" are the same
 * money moving through the account's cash balance before it's invested --
 * importing them too would count every pound twice. Rows that aren't
 * Completed (pending/cancelled orders) are skipped as well.
 */
export function parseFidelityTransactions(csvText: string): FidelityBuyTransaction[] {
    const lines = csvText.replace(/^﻿/, "").split(/\r?\n/);
    const headerIdx = lines.findIndex((l) => l.startsWith(TX_HEADER_PREFIX));
    if (headerIdx === -1) return [];

    const headerCols = parseCsvLine(lines[headerIdx]).map((h) => h.trim());
    const col = (name: string) => headerCols.findIndex((h) => h.toLowerCase() === name.toLowerCase());

    const idxOrderDate = col("Order date");
    const idxType = col("Transaction type");
    const idxInvestment = col("Investments");
    const idxWrapper = col("Product Wrapper");
    const idxAccount = col("Account Number");
    const idxAmount = col("Amount");
    const idxQuantity = col("Quantity");
    const idxPrice = col("Price per unit");
    const idxRef = col("Reference Number");
    const idxStatus = col("Status");

    const out: FidelityBuyTransaction[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        if (lines[i].trim() === "") continue;
        const row = parseCsvLine(lines[i]);

        const type = row[idxType]?.trim() ?? "";
        const investment = row[idxInvestment]?.trim() ?? "";
        const status = idxStatus >= 0 ? row[idxStatus]?.trim() ?? "" : "Completed";
        if (!/^buy\b/i.test(type)) continue;
        if (/^cash$/i.test(investment)) continue;
        if (status && !/^completed$/i.test(status)) continue;

        const date = parseFidelityDate(row[idxOrderDate]);
        const accountNumber = row[idxAccount]?.trim();
        const amount = toNumber(row[idxAmount]);
        const price = toNumber(row[idxPrice]);
        const quantity = toNumber(row[idxQuantity]);
        if (!date || !accountNumber || amount === null || amount <= 0) continue;

        const units =
            price !== null && price > 0
                ? Math.round((amount / price) * 1e6) / 1e6
                : quantity ?? 0;
        if (units <= 0) continue;

        out.push({
            date,
            accountNumber,
            productWrapper: row[idxWrapper]?.trim() || "Cont",
            investmentName: investment,
            amountGBP: amount,
            units,
            pricePerUnit: price ?? amount / units,
            reference: row[idxRef]?.trim() ?? "",
        });
    }
    return out;
}
