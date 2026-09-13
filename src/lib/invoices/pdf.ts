import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clientAddressLines, splitAddressLines } from "@/lib/invoices/address";

// Ported from incoice/lib/invoice-pdf.ts. Kept on plain numbers/strings
// (never Prisma Decimal/Date objects directly) so this stays a pure,
// easily-testable function — callers convert first.

export type InvoicePdfItem = { description: string; quantity: number; unitPrice: number };

export type InvoicePdfVatTreatment = "standard_uk" | "not_vat_registered" | "zero_export" | "outside_scope";

export type InvoicePdfCompany = {
    name: string;
    representativeName: string;
    registrationNumber: string;
    vatNumber: string;
    address: string;
    bankName: string;
    sortCode: string;
    accountNumber: string;
    iban: string;
};

export type InvoicePdfClient = {
    name: string;
    representativeName: string;
    email: string;
    vatNumber: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
};

export type InvoicePdfInvoice = {
    invoiceNumber: string;
    issueDate: string; // yyyy-mm-dd
    dueDate: string; // yyyy-mm-dd
    currency: string;
    status: string;
    vatTreatment: InvoicePdfVatTreatment;
    notes: string;
    items: InvoicePdfItem[];
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
};

function money(value: number, currency: string) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

export async function generateInvoicePdf({
    invoice,
    company,
    client,
}: {
    invoice: InvoicePdfInvoice;
    company: InvoicePdfCompany;
    client: InvoicePdfClient;
}) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();

    let y = height - 56;
    const left = 48;
    const rightCol = width - 220;
    const columnWidth = 220;

    const drawText = (
        text: string,
        x: number,
        yPos: number,
        options?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> },
    ) => {
        page.drawText(text, {
            x,
            y: yPos,
            size: options?.size ?? 11,
            font: options?.bold ? bold : font,
            color: options?.color ?? rgb(0.13, 0.1, 0.09),
        });
    };

    const wrapText = (text: string, widthLimit: number, size = 11) => {
        const words = text.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            const textWidth = font.widthOfTextAtSize(test, size);
            if (textWidth > widthLimit && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines;
    };

    const drawWrappedLines = (
        lines: string[],
        x: number,
        yPos: number,
        widthLimit: number,
        options?: { size?: number; bold?: boolean; lineGap?: number },
    ) => {
        const size = options?.size ?? 11;
        const lineGap = options?.lineGap ?? 14;
        let currentY = yPos;
        for (const line of lines) {
            for (const wrappedLine of wrapText(line, widthLimit, size)) {
                drawText(wrappedLine, x, currentY, { size, bold: options?.bold });
                currentY -= lineGap;
            }
        }
        return currentY;
    };

    const drawWrapped = (label: string, text: string, x: number, yPos: number, widthLimit: number) => {
        drawText(label, x, yPos, { bold: true, size: 11 });
        return drawWrappedLines([text], x, yPos - 14, widthLimit);
    };

    drawText("INVOICE", left, y, { size: 28, bold: true });
    drawText(invoice.invoiceNumber, rightCol, y + 4, { size: 14, bold: true });
    y -= 40;

    let leftY = y;
    let rightY = y;

    drawText(company.name, left, leftY, { size: 14, bold: true });
    leftY -= 18;
    if (company.representativeName.trim()) {
        drawText(`Representative: ${company.representativeName.trim()}`, left, leftY);
        leftY -= 18;
    }
    leftY = drawWrappedLines(splitAddressLines(company.address), left, leftY, rightCol - left - 20);
    drawText(`Company no: ${company.registrationNumber || "N/A"}`, left, leftY);
    leftY -= 18;
    drawText(`VAT no: ${company.vatNumber || "N/A"}`, left, leftY);
    leftY -= 18;

    drawText(`Issue date: ${invoice.issueDate}`, rightCol, rightY);
    rightY -= 18;
    drawText(`Due date: ${invoice.dueDate}`, rightCol, rightY);
    rightY -= 18;
    drawText(`Currency: ${invoice.currency}`, rightCol, rightY);
    rightY -= 18;
    drawText(`Status: ${invoice.status.toUpperCase()}`, rightCol, rightY);
    rightY -= 18;

    y = Math.min(leftY, rightY) - 24;
    leftY = y;
    rightY = y;

    drawText("Bill to", left, leftY, { bold: true, size: 13 });
    leftY -= 18;
    drawText(client.name, left, leftY, { bold: true });
    leftY -= 16;
    if (client.representativeName.trim()) {
        drawText(`Representative: ${client.representativeName.trim()}`, left, leftY);
        leftY -= 16;
    }
    leftY = drawWrappedLines(clientAddressLines(client), left, leftY, columnWidth);
    drawText(`Email: ${client.email}`, left, leftY);
    leftY -= 16;
    drawText(`Customer VAT / tax no: ${client.vatNumber || "N/A"}`, left, leftY);
    leftY -= 16;

    drawText("Payment details", rightCol, rightY, { bold: true, size: 13 });
    rightY -= 18;
    drawText(company.bankName || "N/A", rightCol, rightY, { bold: true });
    rightY -= 16;
    drawText(`Sort code: ${company.sortCode || "N/A"}`, rightCol, rightY);
    rightY -= 16;
    drawText(`Account number: ${company.accountNumber || "N/A"}`, rightCol, rightY);
    rightY -= 16;
    drawText(`IBAN: ${company.iban || "N/A"}`, rightCol, rightY);
    rightY -= 16;

    y = Math.min(leftY, rightY) - 18;

    page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.84, 0.79, 0.73) });
    y -= 22;

    drawText("Description", left, y, { bold: true });
    drawText("Qty", 350, y, { bold: true });
    drawText("Unit price", 410, y, { bold: true });
    drawText("Amount", 500, y, { bold: true });
    y -= 18;

    for (const item of invoice.items) {
        drawText(item.description, left, y);
        drawText(String(item.quantity), 350, y);
        drawText(money(item.unitPrice, invoice.currency), 410, y);
        drawText(money(item.quantity * item.unitPrice, invoice.currency), 500, y);
        y -= 18;
    }

    y -= 8;
    page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.84, 0.79, 0.73) });
    y -= 24;

    drawText(`Subtotal: ${money(invoice.subtotal, invoice.currency)}`, 380, y, { bold: true });
    y -= 18;
    drawText(`VAT (${invoice.vatRate}%): ${money(invoice.vatAmount, invoice.currency)}`, 380, y);
    y -= 18;
    drawText(`Total: ${money(invoice.total, invoice.currency)}`, 380, y, { size: 13, bold: true });
    y -= 34;

    if (invoice.notes.trim()) {
        y = drawWrapped("Notes", invoice.notes.trim(), left, y, width - left * 2);
    }

    if (invoice.vatTreatment === "not_vat_registered") {
        y = drawWrapped(
            "Important",
            "This invoice does not charge VAT because the supplier is not VAT registered.",
            left,
            y,
            width - left * 2,
        );
    }

    drawText("Thank you for your business.", left, 48, { bold: true, color: rgb(0.43, 0.15, 0.03) });

    return pdf.save();
}
