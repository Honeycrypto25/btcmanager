import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getCurrentBtcPrice } from "@/lib/btc";
import { db } from "@/lib/db";
import { getExchangeRate } from "@/lib/fx";
import { OverviewClient, type OverviewData, type PeriodRow, type AssetFigures } from "@/components/overview/OverviewClient";

interface PeriodAgg {
    btcInvested: number;
    btcAmount: number;
    t212Invested: number;
}

function computeAsset(invested: number, value: number, pnlOverride?: number): AssetFigures {
    const pnl = pnlOverride !== undefined ? pnlOverride : value - invested;
    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, value, pnl, pnlPercent };
}

export default async function OverviewPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    // --- BTC data ---
    const currentBtcPrice = await getCurrentBtcPrice();
    const wallets = await db.bitcoinWallet.findMany({ include: { transactions: true } });
    const allBtcTx = wallets.flatMap((w: any) => w.transactions);

    const totalBtcAmount = allBtcTx.reduce((acc: number, t: any) => acc + t.amount, 0);
    const btcCurrentValue = totalBtcAmount * currentBtcPrice;
    const btcInvested = allBtcTx.reduce((acc: number, t: any) => acc + t.amount * t.priceAtTime, 0);
    const btc = computeAsset(btcInvested, btcCurrentValue);

    // --- T212 data ---
    const t212Account = await db.t212Account.findFirst();
    let t212CurrentValueUsd = 0;
    let t212InvestedUsd = 0;
    let t212PnlUsd = 0;
    let t212Connected = false;
    let t212Snapshot: any = null;
    let gbpToUsd = 1;

    if (t212Account) {
        t212Connected = true;
        t212Snapshot = await db.t212Snapshot.findFirst({
            where: { accountId: t212Account.id },
            orderBy: { capturedAt: "desc" },
        });

        if (t212Snapshot) {
            gbpToUsd = await getExchangeRate(t212Snapshot.currency, "USD");
            t212CurrentValueUsd = t212Snapshot.totalValue * gbpToUsd;
            t212InvestedUsd = t212Snapshot.investedValue * gbpToUsd;
            // Folosim P&L-ul deja calculat corect la sincronizare (total - liber -
            // investit), NU value-invested — altfel cash-ul liber din cont ar fi
            // numărat greșit ca profit.
            t212PnlUsd = t212Snapshot.resultPpl * gbpToUsd;
        }
    }
    const t212 = computeAsset(t212InvestedUsd, t212CurrentValueUsd, t212PnlUsd);
    // Raport câștig/investit la nivel de cont — folosit ca să estimăm valoarea
    // curentă a banilor investiți în FIECARE perioadă (nu avem, per depunere
    // individuală, ce anume s-a cumpărat cu ea, deci nu putem calcula exact ca
    // la BTC — presupunem performanță uniformă pe toate depunerile).
    const t212Ratio = t212InvestedUsd > 0 ? (t212InvestedUsd + t212PnlUsd) / t212InvestedUsd : 1;

    // --- Combined totals ---
    const totalInvested = btc.invested + t212.invested;
    const totalValue = btc.value + t212.value;
    const combined = computeAsset(totalInvested, totalValue, btc.pnl + t212.pnl);

    // --- Yearly / monthly breakdown ---
    const yearly = new Map<number, PeriodAgg>();
    const monthly = new Map<string, PeriodAgg>(); // "YYYY-MM"

    const addTo = (map: Map<any, PeriodAgg>, key: any, patch: Partial<PeriodAgg>) => {
        const existing = map.get(key) ?? { btcInvested: 0, btcAmount: 0, t212Invested: 0 };
        map.set(key, {
            btcInvested: existing.btcInvested + (patch.btcInvested ?? 0),
            btcAmount: existing.btcAmount + (patch.btcAmount ?? 0),
            t212Invested: existing.t212Invested + (patch.t212Invested ?? 0),
        });
    };

    for (const tx of allBtcTx) {
        const d = new Date(tx.timestamp);
        const invested = tx.amount * tx.priceAtTime;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        addTo(yearly, d.getFullYear(), { btcInvested: invested, btcAmount: tx.amount });
        addTo(monthly, monthKey, { btcInvested: invested, btcAmount: tx.amount });
    }

    if (t212Account) {
        const deposits = await db.t212CashFlow.findMany({
            where: { accountId: t212Account.id, type: "DEPOSIT" },
        });
        for (const dep of deposits) {
            const d = new Date(dep.dateTime);
            const investedUsd = dep.amount * gbpToUsd;
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            addTo(yearly, d.getFullYear(), { t212Invested: investedUsd });
            addTo(monthly, monthKey, { t212Invested: investedUsd });
        }
    }

    const buildRow = (label: string, agg: PeriodAgg): PeriodRow => {
        const btcValue = agg.btcAmount * currentBtcPrice;
        const btcRow = computeAsset(agg.btcInvested, btcValue);
        const t212Value = agg.t212Invested * t212Ratio;
        const t212Row = computeAsset(agg.t212Invested, t212Value);
        const totalRow = computeAsset(agg.btcInvested + agg.t212Invested, btcValue + t212Value);
        return { label, btc: btcRow, t212: t212Row, total: totalRow };
    };

    const yearlyRows: PeriodRow[] = Array.from(yearly.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([year, agg]) => buildRow(String(year), agg));

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyRows: PeriodRow[] = Array.from(monthly.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, agg]) => {
            const [y, m] = key.split('-');
            const monthIdx = parseInt(m, 10) - 1;
            return buildRow(`${monthNames[monthIdx]} ${y}`, agg);
        });

    const usdToGbp = await getExchangeRate("USD", "GBP");

    const data: OverviewData = {
        totalInvested: combined.invested,
        totalValue: combined.value,
        totalPnl: combined.pnl,
        pnlPercent: combined.pnlPercent,
        btc: { ...btc, amount: totalBtcAmount },
        t212: { ...t212, connected: t212Connected, hasSnapshot: !!t212Snapshot },
        yearlyRows,
        monthlyRows,
        t212NativeCurrency: t212Snapshot?.currency ?? null,
        t212FxRate: gbpToUsd,
    };

    return (
        <DashboardLayout>
            <OverviewClient data={data} usdToGbp={usdToGbp} />
        </DashboardLayout>
    );
}
