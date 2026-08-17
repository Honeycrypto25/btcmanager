export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listIncome } from "@/app/actions/self-employed";
import { listBankAccounts } from "@/app/actions/bank";
import { IncomeClient } from "@/components/self-employed/IncomeClient";

export default async function IncomePage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const [incomes, accounts] = await Promise.all([listIncome(), listBankAccounts()]);

    // Prisma Decimal -> plain number for client components
    const serialized = incomes.map((i: any) => ({
        id: i.id,
        date: i.date.toISOString(),
        description: i.description,
        client: i.client,
        amount: Number(i.amount),
        paymentMethod: i.paymentMethod,
        taxYear: i.taxYear,
        notes: i.notes,
        accountName: i.accountName,
    }));

    const serializedAccounts = accounts.map((a: any) => ({ id: a.id, name: a.name }));

    return (
        <DashboardLayout>
            <IncomeClient initialIncomes={serialized} accounts={serializedAccounts} />
        </DashboardLayout>
    );
}
