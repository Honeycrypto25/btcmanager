export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listExpenses, EXPENSE_CATEGORIES } from "@/app/actions/self-employed";
import { ExpensesClient } from "@/components/self-employed/ExpensesClient";

export default async function ExpensesPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const expenses = await listExpenses();

    const serialized = expenses.map((e: any) => ({
        id: e.id,
        date: e.date.toISOString(),
        merchant: e.merchant,
        description: e.description,
        amount: Number(e.amount),
        vatAmount: e.vatAmount !== null ? Number(e.vatAmount) : null,
        category: e.category,
        paymentMethod: e.paymentMethod,
        businessUsePercentage: e.businessUsePercentage,
        allowableExpenseStatus: e.allowableExpenseStatus,
        taxYear: e.taxYear,
        notes: e.notes,
    }));

    return (
        <DashboardLayout>
            <ExpensesClient initialExpenses={serialized} categories={[...EXPENSE_CATEGORIES]} />
        </DashboardLayout>
    );
}
