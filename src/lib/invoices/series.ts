// Ported as-is from incoice/lib/invoice-series.ts.

export function buildInvoiceSeries(companyName: string) {
    const words = companyName
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
        .filter(Boolean);

    if (!words.length) return "INV";

    if (words.length === 1) {
        const first = words[0].toUpperCase();
        return `${first.slice(0, 3)}XXX`.slice(0, 3);
    }

    const firstWord = words[0].toUpperCase();
    const secondWord = words[1].toUpperCase();

    return `${(firstWord.slice(0, 2) + secondWord.slice(0, 1) + "XXX").slice(0, 3)}`;
}

export function formatInvoiceNumber(series: string, sequence: number) {
    return `${series}-${String(sequence).padStart(4, "0")}`;
}
