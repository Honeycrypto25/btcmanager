import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import HistoryClient from "./HistoryClient";

export default async function HistoryPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/signin");
    }

    // Fetch all transactions with wallet info
    const transactions = await db.bitcoinTransaction.findMany({
        include: { wallet: true },
        orderBy: { timestamp: 'desc' },
    });

    // Serialize dates for client component
    const serializedTransactions = transactions.map((tx: any) => ({
        ...tx,
        timestamp: tx.timestamp.toISOString(),
        createdAt: tx.createdAt.toISOString(),
    }));

    return (
        <DashboardLayout>
            <HistoryClient initialTransactions={serializedTransactions} />
        </DashboardLayout>
    );
}
