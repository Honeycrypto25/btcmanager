export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getEvmStats, listEvmLots, listEvmSweeps, getEvmFuelStatus } from "@/app/actions/evm";
import { EvmStatsClient } from "@/components/evm/EvmStatsClient";
import { getWethPriceUsd } from "@/lib/evm/oneinch";

export default async function BaseStatsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const [lots, stats, wethPriceUsd, sweeps, fuelStatus] = await Promise.all([
        listEvmLots(),
        getEvmStats(),
        getWethPriceUsd().catch(() => null),
        listEvmSweeps(),
        getEvmFuelStatus(),
    ]);

    return (
        <DashboardLayout>
            <EvmStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                wethPriceUsd={wethPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                fuelStatus={fuelStatus}
            />
        </DashboardLayout>
    );
}
