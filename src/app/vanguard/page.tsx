export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listVanguardAccounts } from "@/app/actions/vanguard";
import { VanguardClient } from "@/components/vanguard/VanguardClient";

export default async function VanguardPage() {
    const session = await requireSectionAccess("investments");

    const accounts = await listVanguardAccounts();

    const serialized = accounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        accountType: a.accountType,
        currency: a.currency,
        holdings: a.holdings.map((h: any) => ({
            id: h.id,
            fundName: h.fundName,
            ticker: h.ticker,
            units: h.units ? Number(h.units) : null,
            costBasis: Number(h.costBasis),
            currentValue: Number(h.currentValue),
            valueUpdatedAt: h.valueUpdatedAt.toISOString(),
        })),
    }));

    return (
        <DashboardLayout>
            <VanguardClient initialAccounts={serialized} />
        </DashboardLayout>
    );
}
