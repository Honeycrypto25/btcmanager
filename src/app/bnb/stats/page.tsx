export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBnbStats, listBnbLots, listBnbSweeps, getBnbFuelStatus } from "@/app/actions/bnb";
import { BnbStatsClient } from "@/components/bnb/BnbStatsClient";
import { getBnbPriceUsd } from "@/lib/bnb/oneinch";

export default async function BnbStatsPage() {
    const session = await requireSectionAccess("bnb");

    const [lots, stats, bnbPriceUsd, sweeps, fuelStatus] = await Promise.all([
        listBnbLots(),
        getBnbStats(),
        getBnbPriceUsd().catch(() => null),
        listBnbSweeps(),
        getBnbFuelStatus(),
    ]);

    return (
        <DashboardLayout>
            <BnbStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                bnbPriceUsd={bnbPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                fuelStatus={fuelStatus}
            />
        </DashboardLayout>
    );
}
