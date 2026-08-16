export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getOverviewData } from "@/lib/overview-data";
import { getVanguardTotals } from "@/app/actions/vanguard";
import { InvestmentsOverviewClient } from "@/components/vanguard/InvestmentsOverviewClient";

/** Unified Investments Overview: reads BTC + T212 totals from the EXISTING
 * getOverviewData() (unmodified — same function the / page and email
 * reports already use) and shows Vanguard totals alongside as a SEPARATE
 * figure, per spec: never combine incomparable metrics (different
 * currencies/asset classes, no shared cost basis). */
export default async function InvestmentsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const [{ data }, vanguard] = await Promise.all([getOverviewData(), getVanguardTotals()]);

    return (
        <DashboardLayout>
            <InvestmentsOverviewClient
                btc={data.btc}
                t212={data.t212}
                btcT212Total={{ invested: data.totalInvested, value: data.totalValue, pnl: data.totalPnl, pnlPercent: data.pnlPercent }}
                vanguard={vanguard}
            />
        </DashboardLayout>
    );
}
