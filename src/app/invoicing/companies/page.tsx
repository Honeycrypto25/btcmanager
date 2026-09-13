export const dynamic = "force-dynamic";

import React from "react";
import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listInvoiceCompanies } from "@/app/actions/invoices";
import { InvoiceCompaniesClient } from "@/components/invoicing/InvoiceCompaniesClient";

export default async function InvoiceCompaniesPage() {
    await requireSectionAccess("invoicing");
    const companies = await listInvoiceCompanies();

    const serialized = companies.map((c: any) => ({
        id: c.id,
        name: c.name,
        representativeName: c.representativeName,
        registrationNumber: c.registrationNumber ?? "",
        vatNumber: c.vatNumber,
        address: c.address,
        bankName: c.bankName,
        sortCode: c.sortCode,
        accountNumber: c.accountNumber,
        iban: c.iban,
        currency: c.currency,
        defaultVatRate: Number(c.defaultVatRate),
    }));

    return (
        <DashboardLayout>
            <InvoiceCompaniesClient initialCompanies={serialized} />
        </DashboardLayout>
    );
}
