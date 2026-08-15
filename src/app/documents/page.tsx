export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listDocuments } from "@/app/actions/documents";
import { listVehicles } from "@/app/actions/vehicles";
import { isR2Configured } from "@/lib/r2/client";
import { DocumentsClient } from "@/components/vehicles/DocumentsClient";

export default async function DocumentsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const [documents, vehicles] = await Promise.all([listDocuments(), listVehicles()]);

    const serialized = documents.map((d: any) => ({
        id: d.id,
        category: d.category,
        title: d.title,
        vehicleId: d.vehicleId,
        expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
    }));

    const vehicleOptions = vehicles.map((v: any) => ({ id: v.id, name: v.name }));

    return (
        <DashboardLayout>
            <DocumentsClient initialDocuments={serialized} vehicles={vehicleOptions} r2Configured={isR2Configured()} />
        </DashboardLayout>
    );
}
