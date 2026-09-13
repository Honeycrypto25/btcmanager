export const dynamic = "force-dynamic";

import React from "react";
import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listInvoices, listInvoiceCompanies, listInvoiceClients } from "@/app/actions/invoices";
import { InvoicingClient } from "@/components/invoicing/InvoicingClient";

export default async function InvoicingPage() {
    await requireSectionAccess("invoicing");

    const [invoices, companies, clients] = await Promise.all([
        listInvoices(),
        listInvoiceCompanies(),
        listInvoiceClients(),
    ]);

    const serializedInvoices = invoices.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        companyId: inv.companyId,
        companyName: inv.company.name,
        clientId: inv.clientId,
        clientName: inv.client.name,
        issueDate: inv.issueDate.toISOString().slice(0, 10),
        dueDate: inv.dueDate.toISOString().slice(0, 10),
        currency: inv.currency,
        customerRegion: inv.customerRegion,
        vatTreatment: inv.vatTreatment,
        status: inv.status,
        notes: inv.notes,
        items: inv.items as unknown as { description: string; quantity: number; unitPrice: number }[],
        subtotal: Number(inv.subtotal),
        vatRate: Number(inv.vatRate),
        vatAmount: Number(inv.vatAmount),
        total: Number(inv.total),
        hasPdf: Boolean(inv.pdfKey),
    }));

    const serializedCompanies = companies.map((c: any) => ({ id: c.id, name: c.name, currency: c.currency, defaultVatRate: Number(c.defaultVatRate) }));
    const serializedClients = clients.map((c: any) => ({ id: c.id, name: c.name }));

    return (
        <DashboardLayout>
            <InvoicingClient initialInvoices={serializedInvoices} companies={serializedCompanies} clients={serializedClients} />
        </DashboardLayout>
    );
}
