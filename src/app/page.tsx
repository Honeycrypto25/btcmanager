export const dynamic = "force-dynamic";

import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getOverviewData } from "@/lib/overview-data";
import { OverviewClient } from "@/components/overview/OverviewClient";
import { getSelfEmployedSummary } from "@/app/actions/self-employed";
import { getCurrentUkTaxYear } from "@/lib/tax/uk-tax-year";

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

    return (
        <DashboardLayout>
            <OverviewClient data={data} usdToGbp={usdToGbp} selfEmployed={selfEmployed} />
        </DashboardLayout>
    );
}
