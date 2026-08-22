export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listReceipts } from "@/app/actions/receipts";
import { isR2Configured } from "@/lib/r2/client";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { ReceiptsClient } from "@/components/self-employed/ReceiptsClient";

export default async function ReceiptsPage() {
    const session = await requireSectionAccess("selfEmployed");

    const receipts = await listReceipts();
    const serialized = receipts.map((r: any) => ({
        id: r.id,
        merchant: r.merchant,
        receiptDate: r.receiptDate ? r.receiptDate.toISOString() : null,
        amount: r.amount !== null ? Number(r.amount) : null,
        currency: r.currency,
        category: r.category,
        status: r.status,
        taxYear: r.taxYear,
        convertedExpenseId: r.convertedExpenseId,
        createdAt: r.createdAt.toISOString(),
    }));

    return (
        <DashboardLayout>
            <ReceiptsClient initialReceipts={serialized} r2Configured={isR2Configured()} categories={[...EXPENSE_CATEGORIES]} />
        </DashboardLayout>
    );
}
