
import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import RoiClient from "./RoiClient";

// Helper to get formatted period strings
const getMonthStr = (date: Date) => date.toISOString().slice(0, 7); // YYYY-MM
const getYearStr = (date: Date) => date.getFullYear().toString();   // YYYY

export default async function RoiPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/signin");
    }

    // 1. Fetch Transactions
    const transactions = await db.bitcoinTransaction.findMany({
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

    // 3. Process Data
    const monthlyMap = new Map<string, { invested: number, btc: number }>();
    const yearlyMap = new Map<string, { invested: number, btc: number }>();
    let totalInvested = 0;
    let totalBtc = 0;

    transactions.forEach(tx => {
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
            .map(([period, data]) => {
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

    return (
        <DashboardLayout>
            <RoiClient
                monthlyData={monthlyData}
                yearlyData={yearlyData}
                currentPrice={currentPrice}
                overall={{
                    totalInvested,
                    totalBtc,
                    currentValue: overallValue,
                    roiPercentage: overallRoi
                }}
            />
        </DashboardLayout>
    );
}
