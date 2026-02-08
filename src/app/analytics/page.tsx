
import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import AnalyticsClient from "./AnalyticsClient";

export default async function AnalyticsPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/signin");
    }

    const wallets = await db.bitcoinWallet.findMany({
        include: { transactions: true }
    });

    // Flatten transactions
    const allTransactions = wallets.flatMap((w) =>
        w.transactions.map((t) => ({
            ...t,
            walletId: w.id,
            wallet: { name: w.name }
        }))
    );

    const walletData = wallets.map(w => ({
        id: w.id,
        name: w.name,
        address: w.address
    }));

    return (
        <DashboardLayout>
            <AnalyticsClient
                wallets={walletData}
                transactions={allTransactions}
            />
        </DashboardLayout>
    );
}
