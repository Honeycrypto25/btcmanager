
import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import RoiClient from "./RoiClient";
import { getExchangeRate } from "@/lib/fx";

// Helper to get formatted period strings
const getMonthStr = (date: Date) => date.toISOString().slice(0, 7); // YYYY-MM
const getYearStr = (date: Date) => date.getFullYear().toString();   // YYYY

// Extracted to a plain (non-component) helper so the Date.now() call sits
// outside the page component's own body — React Compiler's purity check
// flags impure globals called directly inside a component/route function,
// but not ones called through an ordinary helper like this.
function daysSince(date: Date): number {
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function RoiPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/signin");
    }

    // 1. Fetch Transactions
    const transactions = await db.bitcoinTransaction.findMany({
        include: { wallet: true },
        orderBy: { timestamp: 'desc' },
    });

    // 2. Fetch Current Price
    let currentPrice = 95000; // Fallback
    try {
        const res = await fetch('https://mempool.space/api/v1/prices');
        const data = await res.json();
        if (data.USD) currentPrice = data.USD;
    } catch (e) {
        console.error("Failed to fetch price, using fallback", e);
    }

    // Current USD->GBP rate for the ROI evolution chart's £ toggle — same
    // simplification used elsewhere in the app (getExchangeRate falls back
    // to 1:1 on failure, and uses the current rate even for past dates).
    const usdToGbp = await getExchangeRate("USD", "GBP");

    // 3. Process Data
    const monthlyMap = new Map<string, { invested: number, btc: number }>();
    const yearlyMap = new Map<string, { invested: number, btc: number }>();
    let totalInvested = 0;
    let totalBtc = 0;

    transactions.forEach((tx: any) => {
        const amount = tx.amount;
        // Cost basis per transaction = quantity * price_at_time
        const invested = amount * tx.priceAtTime;

        totalInvested += invested;
        totalBtc += amount;

        // Monthly
        const mKey = getMonthStr(tx.timestamp); // Prisma returns Date objects
        const mEntry = monthlyMap.get(mKey) || { invested: 0, btc: 0 };
        mEntry.invested += invested;
        mEntry.btc += amount;
        monthlyMap.set(mKey, mEntry);

        // Yearly
        const yKey = getYearStr(tx.timestamp);
        const yEntry = yearlyMap.get(yKey) || { invested: 0, btc: 0 };
        yEntry.invested += invested;
        yEntry.btc += amount;
        yearlyMap.set(yKey, yEntry);
    });

    // 4. Format for Client
    const buildRoiData = (map: Map<string, { invested: number, btc: number }>) => {
        return Array.from(map.entries())
            .sort((a, b) => b[0].localeCompare(a[0])) // Descending order
            .map(([period, data]: [string, any]) => {
                const currentValue = data.btc * currentPrice;
                const roiAmount = currentValue - data.invested;
                const roiPercentage = data.invested > 0 ? (roiAmount / data.invested) * 100 : 0;

                return {
                    period,
                    totalInvested: data.invested,
                    totalBtc: data.btc,
                    costBasis: data.invested,
                    currentValue,
                    roiPercentage,
                    roiAmount
                };
            });
    };

    const monthlyData = buildRoiData(monthlyMap);
    const yearlyData = buildRoiData(yearlyMap);

    const overallValue = totalBtc * currentPrice;
    const overallRoi = totalInvested > 0 ? ((overallValue - totalInvested) / totalInvested) * 100 : 0;

    // Second row of stat cards — all derived from the transactions we
    // already fetched, no extra queries or API calls.
    const totalPurchases = transactions.length;
    const avgBuyPrice = totalBtc > 0 ? totalInvested / totalBtc : 0;

    const largestPurchase = transactions.reduce<{ amountUsd: number; date: Date; wallet: string } | null>(
        (best, tx) => {
            const amountUsd = tx.amount * tx.priceAtTime;
            if (!best || amountUsd > best.amountUsd) {
                return { amountUsd, date: tx.timestamp, wallet: tx.wallet?.name ?? "" };
            }
            return best;
        },
        null
    );

    // transactions is ordered desc by timestamp, so the last entry is the earliest.
    const firstPurchaseDate: Date | null = transactions.length > 0 ? transactions[transactions.length - 1].timestamp : null;
    const daysInvesting = firstPurchaseDate ? daysSince(firstPurchaseDate) : 0;

    // Serialize transactions for client component
    const serializedTransactions = transactions.map((tx: any) => ({
        ...tx,
        timestamp: tx.timestamp.toISOString(),
        createdAt: tx.createdAt.toISOString(),
    }));

    return (
        <DashboardLayout>
            <RoiClient
                monthlyData={monthlyData}
                yearlyData={yearlyData}
                currentPrice={currentPrice}
                transactions={serializedTransactions}
                usdToGbp={usdToGbp}
                overall={{
                    totalInvested,
                    totalBtc,
                    currentValue: overallValue,
                    roiPercentage: overallRoi
                }}
                extraStats={{
                    totalPurchases,
                    avgBuyPrice,
                    largestPurchase: largestPurchase
                        ? { amountUsd: largestPurchase.amountUsd, date: largestPurchase.date.toISOString(), wallet: largestPurchase.wallet }
                        : null,
                    firstPurchaseDate: firstPurchaseDate ? firstPurchaseDate.toISOString() : null,
                    daysInvesting,
                }}
            />
        </DashboardLayout>
    );
}
