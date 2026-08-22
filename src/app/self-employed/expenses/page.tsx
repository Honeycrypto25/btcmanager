export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listExpenses } from "@/app/actions/self-employed";
import { listBankAccounts } from "@/app/actions/bank";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { ExpensesClient } from "@/components/self-employed/ExpensesClient";

export default async function ExpensesPage() {
    const session = await requireSectionAccess("selfEmployed");

    const [expenses, accounts] = await Promise.all([listExpenses(), listBankAccounts()]);

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
        receiptId: e.receiptId,
        accountName: e.accountName,
    }));

    const serializedAccounts = accounts.map((a: any) => ({ id: a.id, name: a.name }));

    return (
        <DashboardLayout>
            <ExpensesClient initialExpenses={serialized} categories={[...EXPENSE_CATEGORIES]} accounts={serializedAccounts} />
        </DashboardLayout>
    );
}
