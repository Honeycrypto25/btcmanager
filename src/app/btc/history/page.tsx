import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getCurrentBtcPrice } from "@/lib/btc";
import { getBtcAth } from "@/lib/btc-ath";
import HistoryClient from "./HistoryClient";
import { cachedPageData, sessionUserId } from "@/lib/page-cache";

export default async function HistoryPage() {
    const session = await requireSectionAccess("btc");

    // Current BTC price, ATH and all transactions with wallet info (cached until a change / refresh)
    const { currentPrice, ath, transactions } = await cachedPageData("btc-history", sessionUserId(session), async () => {
        const currentPrice = await getCurrentBtcPrice();
        const [ath, transactions] = await Promise.all([
            getBtcAth(currentPrice),
            db.bitcoinTransaction.findMany({ include: { wallet: true }, orderBy: { timestamp: "desc" } }),
        ]);
        return { currentPrice, ath, transactions };
    });

    // Serialize dates for client component
    const serializedTransactions = transactions.map((tx: any) => ({
        ...tx,
        timestamp: tx.timestamp.toISOString(),
        createdAt: tx.createdAt.toISOString(),
    }));

    return (
        <DashboardLayout>
            <HistoryClient
                initialTransactions={serializedTransactions}
                currentBtcPrice={currentPrice}
                athPrice={ath?.price ?? 0}
            />
        </DashboardLayout>
    );
}
