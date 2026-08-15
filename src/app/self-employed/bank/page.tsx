export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listBankAccounts, listBankTransactions, listImportBatches } from "@/app/actions/bank";
import { BankClient } from "@/components/self-employed/BankClient";

export default async function BankPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const [accounts, transactions, batches] = await Promise.all([
        listBankAccounts(),
        listBankTransactions(),
        listImportBatches(),
    ]);

    const serializedTransactions = transactions.map((t: any) => ({
        id: t.id,
        transactionDate: t.transactionDate.toISOString(),
        description: t.description,
        amount: Number(t.amount),
        debitCredit: t.debitCredit,
        balance: t.balance !== null ? Number(t.balance) : null,
        receiptId: t.receiptId,
        matchConfidence: t.matchConfidence,
        matchStatus: t.matchStatus,
        taxYear: t.taxYear,
    }));

    const serializedBatches = batches.map((b: any) => ({
        id: b.id,
        filename: b.filename,
        rowCount: b.rowCount,
        importedCount: b.importedCount,
        duplicateCount: b.duplicateCount,
        createdAt: b.createdAt.toISOString(),
    }));

    const serializedAccounts = accounts.map((a: any) => ({ id: a.id, name: a.name, currency: a.currency }));

    return (
        <DashboardLayout>
            <BankClient accounts={serializedAccounts} transactions={serializedTransactions} batches={serializedBatches} />
        </DashboardLayout>
    );
}
