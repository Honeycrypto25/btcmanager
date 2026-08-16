/**
 * Heuristic parser that turns raw OCR text from a receipt (Google Cloud
 * Vision TEXT_DETECTION output) into a best-effort guess at the structured
 * fields the receipt form uses. Deliberately regex/heuristics-based, not
 * ML — good enough to save the user from retyping most receipts, while
 * never being persisted directly: the parsed values only prefill the form
 * client-side, the user still reviews/corrects and explicitly saves.
 */

export interface ParsedReceiptFields {
    merchant?: string;
    receiptDate?: string; // YYYY-MM-DD, matches the <input type="date"> field
    receiptTime?: string; // HH:MM, matches the <input type="time"> field
    amount?: number;
    vatAmount?: number;
    currency?: string; // ISO code, e.g. GBP
    paymentMethod?: string;
}

const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

function normalizeYear(y: number): number {
    if (y < 100) return y < 70 ? 2000 + y : 1900 + y;
    return y;
}

function parseDate(text: string): string | undefined {
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (2 or 4 digit year)
    let m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const year = normalizeYear(parseInt(m[3], 10));
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return `${year}-${pad2(month)}-${pad2(day)}`;
        }
    }
    // YYYY-MM-DD
    m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) {
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const day = parseInt(m[3], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${pad2(month)}-${pad2(day)}`;
        }
    }
    // "12 Aug 2026" / "12 August 2026"
    m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = MONTHS[m[2].toLowerCase()];
        const year = normalizeYear(parseInt(m[3], 10));
        if (month && day >= 1 && day <= 31) {
            return `${year}-${pad2(month)}-${pad2(day)}`;
        }
    }
    // "Aug 12, 2026" / "August 12 2026"
    m = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);
    if (m) {
        const month = MONTHS[m[1].toLowerCase()];
        const day = parseInt(m[2], 10);
        const year = normalizeYear(parseInt(m[3], 10));
        if (month && day >= 1 && day <= 31) {
            return `${year}-${pad2(month)}-${pad2(day)}`;
        }
    }
    return undefined;
}

function parseTime(text: string): string | undefined {
    const m = text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\b/);
    if (m) {
        let hour = parseInt(m[1], 10);
        const minute = m[2];
        const ampm = m[3]?.toLowerCase();
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        if (hour >= 0 && hour <= 23) {
            return `${pad2(hour)}:${minute}`;
        }
    }
    return undefined;
}

function parseCurrency(text: string): string | undefined {
    if (text.includes("£")) return "GBP";
    if (text.includes("€")) return "EUR";
    if (text.includes("$")) return "USD";
    if (/\bGBP\b/i.test(text)) return "GBP";
    if (/\bEUR\b/i.test(text)) return "EUR";
    if (/\bUSD\b/i.test(text)) return "USD";
    return undefined;
}

const AMOUNT_RE = /[£$€]?\s*(\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/;

function extractAmount(line: string): number | undefined {
    const m = line.match(AMOUNT_RE);
    if (!m) return undefined;
    let raw = m[1];
    raw = raw.replace(/,(?=\d{3}(\D|$))/g, ""); // 1,234.56 -> 1234.56
    raw = raw.replace(",", "."); // European comma-decimal (12,50 -> 12.50)
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : undefined;
}

const TOTAL_KEYWORDS = /\b(grand total|total due|amount due|balance due|total)\b/i;
const EXCLUDE_TOTAL_KEYWORDS = /\b(sub[\s-]?total|change|cash tendered|tender|vat|tax)\b/i;
const VAT_KEYWORDS = /\b(vat|tax)\b/i;
const PAYMENT_KEYWORDS: { re: RegExp; label: string }[] = [
    { re: /\bcontactless\b/i, label: "Contactless" },
    { re: /\bvisa\b/i, label: "Card (Visa)" },
    { re: /\bmastercard\b/i, label: "Card (Mastercard)" },
    { re: /\bdebit\b/i, label: "Card debit" },
    { re: /\bcredit\s*card\b/i, label: "Card credit" },
    { re: /\bcash\b/i, label: "Cash" },
];

const BOILERPLATE_FIRST_LINE = /^(receipt|tax invoice|invoice|vat receipt|thank you|welcome to)\b/i;

export function parseReceiptOcrText(text: string): ParsedReceiptFields {
    const result: ParsedReceiptFields = {};
    if (!text) return result;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Merchant: first substantial, non-boilerplate line — receipts almost
    // always print the shop/company name as the very first line(s).
    for (const line of lines.slice(0, 6)) {
        if (/[A-Za-z]{3,}/.test(line) && !BOILERPLATE_FIRST_LINE.test(line) && !/^\d+$/.test(line)) {
            result.merchant = line.slice(0, 80);
            break;
        }
    }

    // Total: prefer the LAST line matching a total keyword (subtotal/VAT
    // breakdowns usually appear before the final total on a receipt).
    let bestTotal: number | undefined;
    for (const line of lines) {
        if (TOTAL_KEYWORDS.test(line) && !EXCLUDE_TOTAL_KEYWORDS.test(line)) {
            const amt = extractAmount(line);
            if (amt !== undefined) bestTotal = amt;
        }
    }
    if (bestTotal === undefined) {
        // Fallback: the largest money-shaped figure on the receipt is
        // usually the total (line items are smaller than their sum).
        let max: number | undefined;
        for (const line of lines) {
            const amt = extractAmount(line);
            if (amt !== undefined && (max === undefined || amt > max)) max = amt;
        }
        bestTotal = max;
    }
    if (bestTotal !== undefined) result.amount = bestTotal;

    // VAT
    for (const line of lines) {
        if (VAT_KEYWORDS.test(line)) {
            const amt = extractAmount(line);
            if (amt !== undefined) {
                result.vatAmount = amt;
                break;
            }
        }
    }

    const date = parseDate(text);
    if (date) result.receiptDate = date;

    const time = parseTime(text);
    if (time) result.receiptTime = time;

    const currency = parseCurrency(text);
    if (currency) result.currency = currency;

    for (const { re, label } of PAYMENT_KEYWORDS) {
        if (re.test(text)) {
            result.paymentMethod = label;
            break;
        }
    }

    return result;
}
