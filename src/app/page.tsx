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
import { getBtcEvolution, getT212Evolution, getVanguardEvolution, type AssetEvolution, type ValuePoint } from "@/lib/overview-evolution";

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

    // Shared GBP->USD rate — used to convert Vanguard's native-GBP figures
    // (totals, accounts, evolution, value history) onto the same USD base
    // as BTC/T212, and by the T212 evolution lookup below. Falls back to 1
    // (no conversion) rather than throwing, so a rate-fetch hiccup degrades
    // gracefully instead of taking out three sections of the page at once.
    let gbpToUsd = 1;
    try {
        gbpToUsd = await getExchangeRate("GBP", "USD");
    } catch {
        gbpToUsd = 1;
    }

    // Vanguard — native figures are GBP, converted to the same USD base as
    // BTC/T212 so OverviewClient can combine and scale them together with
    // the existing currency toggle. Isolated in its own try/catch, same
    // reasoning as selfEmployed above: a Vanguard read failure must never
    // take down the rest of the dashboard.
    let vanguard: VanguardOverviewSnapshot | null = null;
    try {
        const [totals, accounts] = await Promise.all([
            getVanguardTotals(),
            getVanguardAccountSummaries(),
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

    // 30-day / 6-month / 1-year value evolution for each asset, plus the
    // Vanguard total-value time series for the evolution chart. Each
    // individual lookup already guards its own failures (see
    // lib/overview-evolution.ts) and degrades to nulls/empty rather than
    // throwing, so this block can't take down the rest of the dashboard.
    let evolution: { btc: AssetEvolution; t212: AssetEvolution; vanguard: AssetEvolution } | null = null;
    let vanguardSeries: ValuePoint[] = [];
    try {
        const [btcEvo, t212Evo, vanguardEvo] = await Promise.all([
            getBtcEvolution(),
            getT212Evolution(gbpToUsd),
            getVanguardEvolution(gbpToUsd),
        ]);
        evolution = { btc: btcEvo, t212: t212Evo, vanguard: vanguardEvo.evolution };
        vanguardSeries = vanguardEvo.series;
    } catch {
        evolution = null;
        vanguardSeries = [];
    }

    return (
        <DashboardLayout>
            <OverviewClient
                data={data}
                usdToGbp={usdToGbp}
                selfEmployed={selfEmployed}
                vanguard={vanguard}
                evolution={evolution}
                vanguardSeries={vanguardSeries}
            />
        </DashboardLayout>
    );
}
