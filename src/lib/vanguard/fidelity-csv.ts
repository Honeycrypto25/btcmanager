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
