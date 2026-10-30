export const dynamic = "force-dynamic";

import React from "react";
import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getCurrentBtcPrice } from "@/lib/btc";
import { getBtcAth } from "@/lib/btc-ath";
import IathClient, { type IathPeriod } from "./IathClient";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Bucket = { invested: number; btc: number };

function toPeriods(map: Map<string, Bucket>, label: (key: string) => string, currentPrice: number, athPrice: number): IathPeriod[] {
    return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0])) // oldest first
        .map(([key, b]) => ({
            key,
            label: label(key),
            invested: b.invested,
            btc: b.btc,
            valueNow: b.btc * currentPrice,
            valueAtAth: b.btc * athPrice,
        }));
}

export default async function IathPage() {
    await requireSectionAccess("btc");

    const transactions = await db.bitcoinTransaction.findMany({ orderBy: { timestamp: "asc" } });
    const currentPrice = await getCurrentBtcPrice();
    const ath = await getBtcAth(currentPrice);

    const monthly = new Map<string, Bucket>();
    const yearly = new Map<string, Bucket>();
    let totalInvested = 0;
    let totalBtc = 0;

    for (const tx of transactions) {
        const invested = tx.amount * tx.priceAtTime;
        totalInvested += invested;
        totalBtc += tx.amount;
        const iso = tx.timestamp.toISOString();
        for (const [map, key] of [[monthly, iso.slice(0, 7)], [yearly, iso.slice(0, 4)]] as const) {
            const cur = map.get(key) ?? { invested: 0, btc: 0 };
            cur.invested += invested;
            cur.btc += tx.amount;
            map.set(key, cur);
        }
    }

    const athPrice = ath?.price ?? 0;
    const serializedTransactions = transactions.map((tx) => ({
        amount: tx.amount,
        priceAtTime: tx.priceAtTime,
        timestamp: tx.timestamp.toISOString(),
    }));

    return (
        <DashboardLayout>
            <IathClient
                ath={ath}
                currentPrice={currentPrice}
                totals={{ invested: totalInvested, btc: totalBtc }}
                monthly={toPeriods(monthly, (k) => `${MONTHS[parseInt(k.slice(5, 7), 10) - 1]} ${k.slice(0, 4)}`, currentPrice, athPrice)}
                yearly={toPeriods(yearly, (k) => k, currentPrice, athPrice)}
                transactions={serializedTransactions}
            />
        </DashboardLayout>
    );
}
