import "server-only";

export interface VanguardBuyTransaction {
    date: string; // YYYY-MM-DD
    description: string;
    quantity: number; // precise units bought, parsed from "Bought X ..." rather than
    // the report's own "Quantity" column, which is rounded to 2dp
    price: number | null;
    cost: number;
}

export interface VanguardPdfExtract {
    accountNumber: string | null;
    clientName: string | null;
    wrapperType: string | null;
    transactions: VanguardBuyTransaction[];
}

function toNumber(s: string | undefined | null): number | null {
    if (s === undefined || s === null) return null;
    const n = Number(String(s).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
}

/** Extracts plain text from a PDF buffer, one page joined after another
 * with a `---PAGE---` marker (used below to keep a table that spans a
 * page break readable as one continuous row). Uses pdfjs-dist directly
 * rather than a wrapper library like pdf-parse, since pdf-parse pulls in
 * @napi-rs/canvas (a native binary) for image rendering this app never
 * needs -- plain text extraction alone doesn't require it. */
async function extractPdfText(buffer: Buffer): Promise<string> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // pdfjs-dist normally spins up its parsing worker by resolving
    // "./pdf.worker.mjs" relative to its own bundled location. That
    // relative lookup breaks once Next.js/Turbopack bundles pdf.mjs into a
    // single renamed chunk on Vercel -- the worker file is no longer next
    // to it on disk, so pdfjs falls back to its "fake worker" (in-thread)
    // path, which *also* tries that same broken relative import and fails
    // with "Cannot find module '.../pdf.worker.mjs'". Explicitly resolving
    // the real installed worker file via require.resolve() (a literal
    // string, so Vercel's build-output file tracer picks it up and ships
    // it with the function) avoids the broken relative lookup entirely.
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

    const data = new Uint8Array(buffer);
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

    let allText = "";
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const pageText = (content.items as any[]).map((it) => it.str ?? "").join(" ");
        allText += pageText + "\n---PAGE---\n";
    }
    return allText;
}

function detectWrapperType(text: string): string | null {
    if (/Personal Pension|SIPP/i.test(text)) return "SIPP";
    if (/Junior ISA|JISA/i.test(text)) return "JISA";
    if (/Stocks and Shares ISA|\bISA\b/i.test(text)) return "ISA";
    return null;
}

/**
 * Parses a Vanguard "Client transaction listings" PDF export (the only
 * format Vanguard's own report generator offers for this report -- no
 * CSV/Excel option, unlike Fidelity's export). Only reads the "Investment
 * transactions" table and only "Bought" rows -- this account only ever
 * buys the one fund, so sells/dividends aren't handled yet.
 *
 * The report repeats the client name, account number and column headers
 * on every page, interleaved with the actual table rows once a table
 * spans a page break -- those get stripped out before splitting the
 * table into rows by date, otherwise they'd corrupt whichever row they
 * landed inside (verified against a real 2-page export where the second
 * page contributed nothing but a repeated header + running total).
 */
export function parseVanguardTransactionsPdfText(rawText: string): VanguardPdfExtract {
    const accountNumberMatch = rawText.match(/Account number:\s*([A-Za-z0-9]+)/);
    const clientNameMatch = rawText.match(/Client name:\s*(.+?)(?:\s+Account number:|\n)/);
    const accountNumber = accountNumberMatch ? accountNumberMatch[1] : null;
    const clientName = clientNameMatch ? clientNameMatch[1].trim() : null;
    const wrapperType = detectWrapperType(rawText);

    let text = rawText.replace(/---PAGE---/g, " ").replace(/\s+/g, " ");

    const noisePatterns: RegExp[] = [
        /Account number:\s*[A-Za-z0-9]+/gi,
        /Page\s+\d+\s+of\s+\d+/gi,
        /Date\s+Investment name\s+Transaction\s+details\s+Quantity\s+Price\s*\(£\)\s*Cost\s*\(£\)/gi,
    ];
    if (clientName) {
        noisePatterns.push(new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
    }
    for (const pat of noisePatterns) text = text.replace(pat, " ");
    text = text.replace(/\s+/g, " ");

    const sectionStart = text.indexOf("Investment transactions");
    if (sectionStart === -1) return { accountNumber, clientName, wrapperType, transactions: [] };
    const sectionEnd = text.indexOf("Closing summary", sectionStart);
    const section = text.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

    const DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})/g;
    const dateMatches = [...section.matchAll(DATE_RE)];

    const transactions: VanguardBuyTransaction[] = [];
    for (let i = 0; i < dateMatches.length; i++) {
        const start = dateMatches[i].index as number;
        const end = i + 1 < dateMatches.length ? (dateMatches[i + 1].index as number) : section.length;
        const chunk = section
            .slice(start, end)
            .replace(/\s*Cost\s+£[\d,]+\.\d{2}\s*$/i, "") // the section's running "Cost £x,xxx.xx" total, if it trails the last row
            .trim();

        const [, dd, mm, yyyy] = dateMatches[i];
        const isBuy = /Bought/i.test(chunk);
        const boughtMatch = chunk.match(/Bought\s+([\d.]+)/i);
        const tripletMatch = chunk.match(/([\d.]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
        if (!isBuy || !boughtMatch || !tripletMatch) continue;

        const quantity = toNumber(boughtMatch[1]);
        const cost = toNumber(tripletMatch[3]);
        if (quantity === null || cost === null) continue;

        transactions.push({
            date: `${yyyy}-${mm}-${dd}`,
            description: chunk,
            quantity,
            price: toNumber(tripletMatch[2]),
            cost,
        });
    }

    return { accountNumber, clientName, wrapperType, transactions };
}

export async function extractVanguardTransactionsFromPdf(buffer: Buffer): Promise<VanguardPdfExtract> {
    const text = await extractPdfText(buffer);
    return parseVanguardTransactionsPdfText(text);
}
