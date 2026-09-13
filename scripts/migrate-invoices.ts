/**
 * One-off migration: copies companies/clients/invoices from the standalone
 * incoice ("Ledger Loom") Neon database into this app's own database
 * (InvoiceCompany / InvoiceClient / Invoice models), scoped to one user.
 *
 * incoice's schema doesn't carry a userId (single hardcoded login), so this
 * script needs to be told which of THIS app's users should own the
 * migrated rows.
 *
 * Run once, locally (needs network access to both Neon databases and to
 * R2 — the deployed Vercel environment already has R2 configured; running
 * this from your own machine needs the same R2_* env vars locally too):
 *
 *   OLD_INVOICE_DATABASE_URL="postgresql://...old neon url..." \
 *   ADMIN_USER_EMAIL="sergiu.apostol@gmail.com" \
 *   npx tsx scripts/migrate-invoices.ts
 *
 * DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME must already be set in your shell (e.g. `vercel env pull`
 * into .env.local and `source` it, or export them manually) — same vars
 * the app itself uses.
 *
 * Idempotent-ish: re-running will create duplicate rows (companies/clients
 * are matched by name/email only at the app-action layer, not here) — so
 * run it once against a fresh target, or manually clear the InvoiceCompany
 * / InvoiceClient / Invoice tables for this user before re-running.
 */

import { Client as PgClient } from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../src/lib/db";
import { generateInvoicePdf } from "../src/lib/invoices/pdf";

// Inline, standalone R2 upload (rather than importing src/lib/r2/invoices.ts,
// which pulls in src/lib/r2/client.ts's "server-only" import -- that guard
// throws when run outside Next.js's own bundler, e.g. via plain `tsx`).
function buildInvoicePdfKey(params: { userId: string; invoiceId: string }): string {
    return `users/${params.userId}/invoices/${params.invoiceId}.pdf`;
}

async function uploadInvoicePdfObject(key: string, body: Uint8Array): Promise<void> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET_NAME;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
        throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME must be set.");
    }
    const client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(body), ContentType: "application/pdf" })
    );
}

type OldCompanyRow = {
    id: string;
    name: string;
    representative_name: string | null;
    registration_number: string | null;
    vat_number: string | null;
    address: string;
    bank_name: string | null;
    sort_code: string | null;
    account_number: string | null;
    iban: string | null;
    currency: string;
    default_vat_rate: string;
};

type OldClientRow = {
    id: string;
    name: string;
    representative_name: string | null;
    email: string;
    country: string;
    address: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    vat_number: string | null;
};

type OldInvoiceRow = {
    id: string;
    invoice_number: string;
    company_id: string;
    client_id: string;
    issue_date: string;
    due_date: string;
    currency: string;
    customer_region: "uk" | "international";
    vat_treatment: "standard_uk" | "not_vat_registered" | "zero_export" | "outside_scope";
    status: "draft" | "issued" | "paid";
    notes: string | null;
    items: { description: string; quantity: number; unitPrice: number }[];
    subtotal: string;
    vat_rate: string;
    vat_amount: string;
    total: string;
};

async function main() {
    const oldDbUrl = process.env.OLD_INVOICE_DATABASE_URL;
    const adminEmail = process.env.ADMIN_USER_EMAIL;
    if (!oldDbUrl) throw new Error("Set OLD_INVOICE_DATABASE_URL to the old incoice Neon connection string.");
    if (!adminEmail) throw new Error("Set ADMIN_USER_EMAIL to the evama.net user who should own the migrated invoices.");

    const user = await db.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
    if (!user) throw new Error(`No user found in this app with email ${adminEmail}. Log in once first so the row exists.`);
    const userId = user.id;

    const old = new PgClient({ connectionString: oldDbUrl, ssl: { rejectUnauthorized: false } });
    await old.connect();

    try {
        const { rows: companies } = await old.query<OldCompanyRow>("select * from companies order by created_at asc");
        const { rows: clients } = await old.query<OldClientRow>("select * from clients order by created_at asc");
        const { rows: invoices } = await old.query<OldInvoiceRow>("select * from invoices order by created_at asc");

        console.log(`Found ${companies.length} companies, ${clients.length} clients, ${invoices.length} invoices in the old DB.`);

        const companyIdMap = new Map<string, string>();
        for (const c of companies) {
            const created = await db.invoiceCompany.create({
                data: {
                    userId,
                    name: c.name,
                    representativeName: c.representative_name ?? "",
                    registrationNumber: c.registration_number,
                    vatNumber: c.vat_number ?? "",
                    address: c.address,
                    bankName: c.bank_name ?? "",
                    sortCode: c.sort_code ?? "",
                    accountNumber: c.account_number ?? "",
                    iban: c.iban ?? "",
                    currency: c.currency,
                    defaultVatRate: Number(c.default_vat_rate),
                },
            });
            companyIdMap.set(c.id, created.id);
            console.log(`  company: ${c.name} -> ${created.id}`);
        }

        const clientIdMap = new Map<string, string>();
        for (const c of clients) {
            const created = await db.invoiceClient.create({
                data: {
                    userId,
                    name: c.name,
                    representativeName: c.representative_name ?? "",
                    email: c.email,
                    country: c.country,
                    address: c.address,
                    addressLine1: c.address_line1 ?? "",
                    addressLine2: c.address_line2 ?? "",
                    city: c.city ?? "",
                    region: c.region ?? "",
                    postalCode: c.postal_code ?? "",
                    vatNumber: c.vat_number ?? "",
                },
            });
            clientIdMap.set(c.id, created.id);
            console.log(`  client: ${c.name} -> ${created.id}`);
        }

        for (const inv of invoices) {
            const newCompanyId = companyIdMap.get(inv.company_id);
            const newClientId = clientIdMap.get(inv.client_id);
            if (!newCompanyId || !newClientId) {
                console.warn(`  SKIP invoice ${inv.invoice_number}: missing mapped company/client`);
                continue;
            }

            const created = await db.invoice.create({
                data: {
                    userId,
                    invoiceNumber: inv.invoice_number,
                    companyId: newCompanyId,
                    clientId: newClientId,
                    issueDate: new Date(inv.issue_date),
                    dueDate: new Date(inv.due_date),
                    currency: inv.currency,
                    customerRegion: inv.customer_region,
                    vatTreatment: inv.vat_treatment,
                    status: inv.status,
                    notes: inv.notes ?? "",
                    items: inv.items as any,
                    subtotal: Number(inv.subtotal),
                    vatRate: Number(inv.vat_rate),
                    vatAmount: Number(inv.vat_amount),
                    total: Number(inv.total),
                },
            });

            // Regenerate the PDF fresh (rather than copying the old public
            // Vercel Blob file) so it lands as a private R2 object from the
            // very first version — see src/lib/r2/invoices.ts.
            try {
                const company = companies.find((c) => c.id === inv.company_id)!;
                const client = clients.find((c) => c.id === inv.client_id)!;
                const pdfBytes = await generateInvoicePdf({
                    invoice: {
                        invoiceNumber: inv.invoice_number,
                        issueDate: inv.issue_date,
                        dueDate: inv.due_date,
                        currency: inv.currency,
                        status: inv.status,
                        vatTreatment: inv.vat_treatment,
                        notes: inv.notes ?? "",
                        items: inv.items,
                        subtotal: Number(inv.subtotal),
                        vatRate: Number(inv.vat_rate),
                        vatAmount: Number(inv.vat_amount),
                        total: Number(inv.total),
                    },
                    company: {
                        name: company.name,
                        representativeName: company.representative_name ?? "",
                        registrationNumber: company.registration_number ?? "",
                        vatNumber: company.vat_number ?? "",
                        address: company.address,
                        bankName: company.bank_name ?? "",
                        sortCode: company.sort_code ?? "",
                        accountNumber: company.account_number ?? "",
                        iban: company.iban ?? "",
                    },
                    client: {
                        name: client.name,
                        representativeName: client.representative_name ?? "",
                        email: client.email,
                        vatNumber: client.vat_number ?? "",
                        addressLine1: client.address_line1 ?? "",
                        addressLine2: client.address_line2 ?? "",
                        city: client.city ?? "",
                        region: client.region ?? "",
                        postalCode: client.postal_code ?? "",
                        country: client.country,
                    },
                });
                const key = buildInvoicePdfKey({ userId, invoiceId: created.id });
                await uploadInvoicePdfObject(key, pdfBytes);
                await db.invoice.update({ where: { id: created.id }, data: { pdfKey: key } });
                console.log(`  invoice: ${inv.invoice_number} -> ${created.id} (PDF ok)`);
            } catch (err) {
                console.warn(`  invoice: ${inv.invoice_number} -> ${created.id} (PDF FAILED: ${(err as Error).message})`);
            }
        }

        console.log("Done.");
    } finally {
        await old.end();
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
