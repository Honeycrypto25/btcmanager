export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listBankAccounts, listBankTransactions, listImportBatches, listReceiptsForManualMatch, listBankConnections } from "@/app/actions/bank";
import { BankClient } from "@/components/self-employed/BankClient";

export default async function BankPage() {
    const session = await requireSectionAccess("selfEmployed");

    const [accounts, transactions, batches, matchableReceipts, connections] = await Promise.all([
        listBankAccounts(),
        listBankTransactions(),
        listImportBatches(),
        listReceiptsForManualMatch(),
        listBankConnections(),
    ]);

    const serializedTransactions = transactions.map((t: any) => ({
        id: t.id,
        accountId: t.accountId,
        transactionDate: t.transactionDate.toISOString(),
        description: t.description,
        amount: Number(t.amount),
        debitCredit: t.debitCredit,
        balance: t.balance !== null ? Number(t.balance) : null,
        receiptId: t.receiptId,
        matchConfidence: t.matchConfidence,
        matchStatus: t.matchStatus,
        taxYear: t.taxYear,
        convertedType: t.convertedType,
        convertedRecordId: t.convertedRecordId,
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

    const serializedConnections = connections.map((c: any) => ({
        id: c.id,
        providerBankName: c.providerBankName,
        lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
        lastSyncError: c.lastSyncError,
        createdAt: c.createdAt.toISOString(),
    }));

    return (
        <DashboardLayout>
            <BankClient accounts={serializedAccounts} transactions={serializedTransactions} batches={serializedBatches} matchableReceipts={matchableReceipts} connections={serializedConnections} />
        </DashboardLayout>
    );
}
