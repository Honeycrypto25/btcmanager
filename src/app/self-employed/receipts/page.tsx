export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listReceipts } from "@/app/actions/receipts";
import { isR2Configured } from "@/lib/r2/client";
import { ReceiptsClient } from "@/components/self-employed/ReceiptsClient";

export default async function ReceiptsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const receipts = await listReceipts();
    const serialized = receipts.map((r: any) => ({
        id: r.id,
        merchant: r.merchant,
        receiptDate: r.receiptDate ? r.receiptDate.toISOString() : null,
        amount: r.amount !== null ? Number(r.amount) : null,
        currency: r.currency,
        category: r.category,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
    }));

    return (
        <DashboardLayout>
            <ReceiptsClient initialReceipts={serialized} r2Configured={isR2Configured()} />
        </DashboardLayout>
    );
}
