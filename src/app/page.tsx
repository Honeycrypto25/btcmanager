export const dynamic = "force-dynamic";

import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getOverviewData } from "@/lib/overview-data";
import { OverviewClient, type VanguardOverviewSnapshot } from "@/components/overview/OverviewClient";
import { getSelfEmployedSummary } from "@/app/actions/self-employed";
import { getCurrentUkTaxYear } from "@/lib/tax/uk-tax-year";
import { getVanguardTotals, getVanguardAccountSummaries } from "@/app/actions/vanguard";
import { getExchangeRate } from "@/lib/fx";

export default async function OverviewPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const { data, usdToGbp } = await getOverviewData();

    // Self-employed snapshot for the current tax year — additive only, does
    // not touch getOverviewData()/OverviewData (BTC/T212 combined figures).
    // Failure here (e.g. before any income/expense rows exist) must never
    // break the main dashboard, so it's isolated in its own try/catch.
    let selfEmployed: { taxYear: string; totalIncome: number; totalExpenses: number; profit: number } | null = null;
    try {
        const taxYear = getCurrentUkTaxYear();
        const summary = await getSelfEmployedSummary(taxYear);
        selfEmployed = { taxYear, totalIncome: summary.totalIncome, totalExpenses: summary.totalExpenses, profit: summary.profit };
    } catch {
        selfEmployed = null;
    }

    // Vanguard — native figures are GBP, converted to the same USD base as
    // BTC/T212 so OverviewClient can combine and scale them together with
    // the existing currency toggle. Isolated in its own try/catch, same
    // reasoning as selfEmployed above: a Vanguard read failure must never
    // take down the rest of the dashboard.
    let vanguard: VanguardOverviewSnapshot | null = null;
    try {
        const [totals, accounts, gbpToUsd] = await Promise.all([
            getVanguardTotals(),
            getVanguardAccountSummaries(),
            getExchangeRate("GBP", "USD"),
        ]);
        vanguard = {
            invested: totals.invested * gbpToUsd,
            value: totals.value * gbpToUsd,
            pnl: totals.pnl * gbpToUsd,
            pnlPercent: totals.pnlPercent,
            accounts: accounts.map((a: (typeof accounts)[number]) => ({
                id: a.id,
                name: a.name,
                accountType: a.accountType,
                invested: a.invested * gbpToUsd,
                value: a.value * gbpToUsd,
                pnl: a.pnl * gbpToUsd,
                pnlPercent: a.pnlPercent,
            })),
        };
    } catch {
        vanguard = null;
    }

    return (
        <DashboardLayout>
            <OverviewClient data={data} usdToGbp={usdToGbp} selfEmployed={selfEmployed} vanguard={vanguard} />
        </DashboardLayout>
    );
}
