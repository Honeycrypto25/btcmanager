"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatClientAddress } from "@/lib/invoices/address";
import { buildInvoiceSeries, formatInvoiceNumber } from "@/lib/invoices/series";
import { generateInvoicePdf, type InvoicePdfItem, type InvoicePdfVatTreatment } from "@/lib/invoices/pdf";
import { buildInvoicePdfKey, uploadInvoicePdfObject, getSignedInvoicePdfUrl, deleteInvoicePdfObject } from "@/lib/r2/invoices";
import { getUkTaxYear } from "@/lib/tax/uk-tax-year";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

function toPlainNumber(value: unknown): number {
    return value == null ? 0 : Number(value);
}

// --- Companies (the entity issuing invoices — Sergiu's own business) ---

export interface InvoiceCompanyInput {
    name: string;
    representativeName?: string;
    registrationNumber?: string;
    vatNumber?: string;
    address: string;
    bankName?: string;
    sortCode?: string;
    accountNumber?: string;
    iban?: string;
    currency: string;
    defaultVatRate: number;
}

export async function listInvoiceCompanies() {
    const userId = await requireUserId();
    return db.invoiceCompany.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function createInvoiceCompany(input: InvoiceCompanyInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const duplicate = await db.invoiceCompany.findFirst({
        where: {
            userId,
            OR: [
                { name: { equals: input.name.trim(), mode: "insensitive" } },
                ...(input.registrationNumber?.trim()
                    ? [{ registrationNumber: { equals: input.registrationNumber.trim(), mode: "insensitive" as const } }]
                    : []),
            ],
        },
    });
    if (duplicate) throw new Error("Există deja o companie cu acest nume sau cod de înregistrare.");

    const company = await db.invoiceCompany.create({
        data: {
            userId,
            name: input.name.trim(),
            representativeName: input.representativeName?.trim() ?? "",
            registrationNumber: input.registrationNumber?.trim() || null,
            vatNumber: input.vatNumber?.trim() ?? "",
            address: input.address,
            bankName: input.bankName?.trim() ?? "",
            sortCode: input.sortCode?.trim() ?? "",
            accountNumber: input.accountNumber?.trim() ?? "",
            iban: input.iban?.trim().toUpperCase() ?? "",
            currency: input.currency.toUpperCase(),
            defaultVatRate: input.defaultVatRate,
        },
    });
    revalidatePath("/invoicing");
    revalidatePath("/invoicing/companies");
    return company;
}

export async function deleteInvoiceCompany(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.invoiceCompany.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    const invoiceCount = await db.invoice.count({ where: { companyId: id } });
    if (invoiceCount > 0) throw new Error("Nu poți șterge o companie care are facturi emise.");
    await db.invoiceCompany.delete({ where: { id } });
    revalidatePath("/invoicing/companies");
}

// --- Clients (who invoices are billed to) ---

export interface InvoiceClientInput {
    name: string;
    representativeName?: string;
    email: string;
    country: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    region?: string;
    postalCode: string;
    vatNumber?: string;
}

export async function listInvoiceClients() {
    const userId = await requireUserId();
    return db.invoiceClient.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

function buildClientData(userId: string, input: InvoiceClientInput) {
    const parts = {
        addressLine1: input.addressLine1.trim(),
        addressLine2: input.addressLine2?.trim() ?? "",
        city: input.city.trim(),
        region: input.region?.trim() ?? "",
        postalCode: input.postalCode.trim(),
        country: input.country.trim(),
    };
    return {
        userId,
        name: input.name.trim(),
        representativeName: input.representativeName?.trim() ?? "",
        email: input.email.trim().toLowerCase(),
        country: parts.country,
        address: formatClientAddress(parts),
        addressLine1: parts.addressLine1,
        addressLine2: parts.addressLine2,
        city: parts.city,
        region: parts.region,
        postalCode: parts.postalCode,
        vatNumber: input.vatNumber?.trim() ?? "",
    };
}

export async function createInvoiceClient(input: InvoiceClientInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const duplicate = await db.invoiceClient.findFirst({
        where: {
            userId,
            OR: [
                { name: { equals: input.name.trim(), mode: "insensitive" } },
                { email: { equals: input.email.trim(), mode: "insensitive" } },
            ],
        },
    });
    if (duplicate) throw new Error("Există deja un client cu acest nume sau email.");

    const client = await db.invoiceClient.create({ data: buildClientData(userId, input) });
    revalidatePath("/invoicing");
    revalidatePath("/invoicing/clients");
    return client;
}

export async function updateInvoiceClient(id: string, input: InvoiceClientInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.invoiceClient.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const duplicate = await db.invoiceClient.findFirst({
        where: {
            userId,
            id: { not: id },
            OR: [
                { name: { equals: input.name.trim(), mode: "insensitive" } },
                { email: { equals: input.email.trim(), mode: "insensitive" } },
            ],
        },
    });
    if (duplicate) throw new Error("Există deja un alt client cu acest nume sau email.");

    const client = await db.invoiceClient.update({ where: { id }, data: buildClientData(userId, input) });
    revalidatePath("/invoicing");
    revalidatePath("/invoicing/clients");
    return client;
}

export async function deleteInvoiceClient(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.invoiceClient.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    const invoiceCount = await db.invoice.count({ where: { clientId: id } });
    if (invoiceCount > 0) throw new Error("Nu poți șterge un client care are facturi emise.");
    await db.invoiceClient.delete({ where: { id } });
    revalidatePath("/invoicing/clients");
}

// --- Invoices ---

export interface InvoiceItemInput {
    description: string;
    quantity: number;
    unitPrice: number;
}

export interface InvoiceInput {
    companyId: string;
    clientId: string;
    issueDate: string; // yyyy-mm-dd
    dueDate: string; // yyyy-mm-dd
    currency: string;
    customerRegion: "uk" | "international";
    vatTreatment: InvoicePdfVatTreatment;
    status: "draft" | "issued" | "paid";
    notes?: string;
    items: InvoiceItemInput[];
}

function computeTotals(items: InvoiceItemInput[], vatTreatment: InvoicePdfVatTreatment, companyVatRate: number) {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const vatRate = vatTreatment === "standard_uk" ? companyVatRate : 0;
    const vatAmount = subtotal * (vatRate / 100);
    const total = subtotal + vatAmount;
    return { subtotal, vatRate, vatAmount, total };
}

export async function listInvoices() {
    const userId = await requireUserId();
    return db.invoice.findMany({
        where: { userId },
        include: { company: true, client: true },
        orderBy: { createdAt: "desc" },
    });
}

export async function getInvoice(id: string) {
    const userId = await requireUserId();
    const invoice = await db.invoice.findUnique({ where: { id }, include: { company: true, client: true } });
    if (!invoice || invoice.userId !== userId) return null;
    return invoice;
}

async function nextInvoiceNumber(userId: string, companyId: string, companyName: string) {
    const series = buildInvoiceSeries(companyName);
    const last = await db.invoice.findFirst({
        where: { userId, companyId, invoiceNumber: { startsWith: `${series}-` } },
        orderBy: { createdAt: "desc" },
    });
    const lastSequence = last ? Number.parseInt(last.invoiceNumber.split("-").pop() ?? "0", 10) : 0;
    return formatInvoiceNumber(series, lastSequence + 1);
}

async function regenerateAndUploadPdf(invoiceId: string, userId: string) {
    const full = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { company: true, client: true } });
    const items = full.items as unknown as InvoicePdfItem[];
    const pdfBytes = await generateInvoicePdf({
        invoice: {
            invoiceNumber: full.invoiceNumber,
            issueDate: full.issueDate.toISOString().slice(0, 10),
            dueDate: full.dueDate.toISOString().slice(0, 10),
            currency: full.currency,
            status: full.status,
            vatTreatment: full.vatTreatment,
            notes: full.notes,
            items,
            subtotal: toPlainNumber(full.subtotal),
            vatRate: toPlainNumber(full.vatRate),
            vatAmount: toPlainNumber(full.vatAmount),
            total: toPlainNumber(full.total),
        },
        company: {
            name: full.company.name,
            representativeName: full.company.representativeName,
            registrationNumber: full.company.registrationNumber ?? "",
            vatNumber: full.company.vatNumber,
            address: full.company.address,
            bankName: full.company.bankName,
            sortCode: full.company.sortCode,
            accountNumber: full.company.accountNumber,
            iban: full.company.iban,
        },
        client: {
            name: full.client.name,
            representativeName: full.client.representativeName,
            email: full.client.email,
            vatNumber: full.client.vatNumber,
            addressLine1: full.client.addressLine1,
            addressLine2: full.client.addressLine2,
            city: full.client.city,
            region: full.client.region,
            postalCode: full.client.postalCode,
            country: full.client.country,
        },
    });

    const key = buildInvoicePdfKey({ userId, invoiceId });
    await uploadInvoicePdfObject(key, pdfBytes);
    if (full.pdfKey !== key) {
        await db.invoice.update({ where: { id: invoiceId }, data: { pdfKey: key } });
    }
    return key;
}

export async function createInvoiceRecord(input: InvoiceInput) {
    await requireAdmin();
    const userId = await requireUserId();

    const company = await db.invoiceCompany.findUnique({ where: { id: input.companyId } });
    if (!company || company.userId !== userId) throw new Error("Compania nu a fost găsită.");
    const client = await db.invoiceClient.findUnique({ where: { id: input.clientId } });
    if (!client || client.userId !== userId) throw new Error("Clientul nu a fost găsit.");
    if (!input.items.length) throw new Error("Adaugă cel puțin un articol pe factură.");

    const invoiceNumber = await nextInvoiceNumber(userId, company.id, company.name);
    const totals = computeTotals(input.items, input.vatTreatment, toPlainNumber(company.defaultVatRate));

    const invoice = await db.invoice.create({
        data: {
            userId,
            invoiceNumber,
            companyId: company.id,
            clientId: client.id,
            issueDate: new Date(input.issueDate),
            dueDate: new Date(input.dueDate),
            currency: input.currency.toUpperCase(),
            customerRegion: input.customerRegion,
            vatTreatment: input.vatTreatment,
            status: input.status,
            notes: input.notes ?? "",
            items: input.items as any,
            ...totals,
        },
    });

    try {
        await regenerateAndUploadPdf(invoice.id, userId);
    } catch (err) {
        // Invoice record is saved either way — PDF generation/upload failing
        // (e.g. R2 not configured yet) shouldn't block bookkeeping.
        console.error("[invoices] PDF generation failed for", invoice.id, err);
    }

    revalidatePath("/invoicing");
    return getInvoice(invoice.id);
}

export async function updateInvoiceRecord(id: string, input: InvoiceInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const company = await db.invoiceCompany.findUnique({ where: { id: input.companyId } });
    if (!company || company.userId !== userId) throw new Error("Compania nu a fost găsită.");
    const client = await db.invoiceClient.findUnique({ where: { id: input.clientId } });
    if (!client || client.userId !== userId) throw new Error("Clientul nu a fost găsit.");
    if (!input.items.length) throw new Error("Adaugă cel puțin un articol pe factură.");

    const totals = computeTotals(input.items, input.vatTreatment, toPlainNumber(company.defaultVatRate));

    await db.invoice.update({
        where: { id },
        data: {
            companyId: company.id,
            clientId: client.id,
            issueDate: new Date(input.issueDate),
            dueDate: new Date(input.dueDate),
            currency: input.currency.toUpperCase(),
            customerRegion: input.customerRegion,
            vatTreatment: input.vatTreatment,
            status: input.status,
            notes: input.notes ?? "",
            items: input.items as any,
            ...totals,
        },
    });

    try {
        await regenerateAndUploadPdf(id, userId);
    } catch (err) {
        console.error("[invoices] PDF regeneration failed for", id, err);
    }

    revalidatePath("/invoicing");
    revalidatePath(`/invoicing/${id}`);
    return getInvoice(id);
}

export async function deleteInvoiceRecord(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    if (existing.pdfKey) {
        await deleteInvoicePdfObject(existing.pdfKey).catch(() => {});
    }
    await db.invoice.delete({ where: { id } });
    revalidatePath("/invoicing");
}

/** Short-lived signed link to view/download the generated PDF. */
export async function getInvoicePdfUrl(id: string): Promise<string | null> {
    const userId = await requireUserId();
    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice || invoice.userId !== userId || !invoice.pdfKey) return null;
    return getSignedInvoicePdfUrl(invoice.pdfKey);
}

export interface IncomeByTaxYearRow {
    taxYear: string;
    companyId: string;
    companyName: string;
    currency: string;
    netIncome: number; // subtotal (ex-VAT) -- VAT collected isn't income, it's owed to HMRC
    grossTotal: number; // subtotal + VAT, for reference
    invoiceCount: number;
}

/**
 * UK-tax-year income breakdown per issuing company, for the Rapoarte tab.
 * Uses issueDate (not dueDate/paid date) to bucket, and excludes drafts --
 * a draft isn't income yet, only an issued/paid invoice is. Grouped by
 * net (subtotal, VAT excluded) since VAT charged on standard_uk invoices
 * is collected on HMRC's behalf, not the business's own income.
 */
export async function getInvoiceIncomeByTaxYear(): Promise<IncomeByTaxYearRow[]> {
    const userId = await requireUserId();
    const invoices = await db.invoice.findMany({
        where: { userId, status: { not: "draft" } },
        include: { company: true },
    });

    const map = new Map<string, IncomeByTaxYearRow>();
    for (const inv of invoices) {
        const taxYear = getUkTaxYear(inv.issueDate);
        const key = `${taxYear}::${inv.companyId}`;
        const existing = map.get(key);
        const netIncome = toPlainNumber(inv.subtotal);
        const grossTotal = toPlainNumber(inv.total);
        if (existing) {
            existing.netIncome += netIncome;
            existing.grossTotal += grossTotal;
            existing.invoiceCount += 1;
        } else {
            map.set(key, {
                taxYear,
                companyId: inv.companyId,
                companyName: inv.company.name,
                currency: inv.currency,
                netIncome,
                grossTotal,
                invoiceCount: 1,
            });
        }
    }

    return Array.from(map.values()).sort((a, b) => b.taxYear.localeCompare(a.taxYear) || a.companyName.localeCompare(b.companyName));
}
