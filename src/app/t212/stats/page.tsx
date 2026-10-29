export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { T212StatsClient } from "@/components/t212/T212StatsClient";
import { getT212PeriodRows } from "@/lib/overview-data";

export default async function T212StatsPage() {
    await requireSectionAccess("t212");

    const account = await db.t212Account.findFirst({ orderBy: { createdAt: "desc" } });

    if (!account) {
        return (
            <DashboardLayout>
                <T212StatsClient account={null} snapshots={[]} orders={[]} periodRows={{ monthly: [], yearly: [] }} />
            </DashboardLayout>
        );
    }

    const [snapshots, orders, periodRows] = await Promise.all([
        db.t212Snapshot.findMany({
            where: { accountId: account.id },
            orderBy: { capturedAt: "asc" },
            select: { capturedAt: true, totalValue: true, investedValue: true, freeCash: true, resultPpl: true },
        }),
        db.t212Order.findMany({
            where: { accountId: account.id },
            orderBy: { filledAt: "asc" },
            select: { filledAt: true, side: true, total: true, realizedProfit: true, ticker: true, name: true },
        }),
        getT212PeriodRows(),
    ]);

    return (
        <DashboardLayout>
            <T212StatsClient
                account={{ currency: account.currency, environment: account.environment }}
                snapshots={JSON.parse(JSON.stringify(snapshots))}
                orders={JSON.parse(JSON.stringify(orders))}
                periodRows={periodRows}
            />
        </DashboardLayout>
    );
}
