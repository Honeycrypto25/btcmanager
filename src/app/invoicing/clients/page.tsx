export const dynamic = "force-dynamic";

import React from "react";
import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listInvoiceClients } from "@/app/actions/invoices";
import { InvoiceClientsClient } from "@/components/invoicing/InvoiceClientsClient";

export default async function InvoiceClientsPage() {
    await requireSectionAccess("invoicing");
    const clients = await listInvoiceClients();

    const serialized = clients.map((c: any) => ({
        id: c.id,
        name: c.name,
        representativeName: c.representativeName,
        email: c.email,
        country: c.country,
        addressLine1: c.addressLine1,
        addressLine2: c.addressLine2,
        city: c.city,
        region: c.region,
        postalCode: c.postalCode,
        vatNumber: c.vatNumber,
    }));

    return (
        <DashboardLayout>
            <InvoiceClientsClient initialClients={serialized} />
        </DashboardLayout>
    );
}
