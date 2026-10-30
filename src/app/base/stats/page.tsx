export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getEvmStats, listEvmLots, listEvmSweeps, getEvmFuelStatus } from "@/app/actions/evm";
import { EvmStatsClient } from "@/components/evm/EvmStatsClient";
import { getWethPriceUsd } from "@/lib/evm/oneinch";
import { listEvmLimitBuys } from "@/lib/evm/limit-buy";

export default async function BaseStatsPage() {
    const session = await requireSectionAccess("base");

    const userId = (session.user as { id?: string } | undefined)?.id;
    const [lots, stats, wethPriceUsd, sweeps, fuelStatus, limitBuys] = await Promise.all([
        listEvmLots(),
        getEvmStats(),
        getWethPriceUsd().catch(() => null),
        listEvmSweeps(),
        getEvmFuelStatus(),
        userId ? listEvmLimitBuys(userId) : Promise.resolve([]),
    ]);

    return (
        <DashboardLayout>
            <EvmStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                wethPriceUsd={wethPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                fuelStatus={fuelStatus}
                limitBuys={JSON.parse(JSON.stringify(limitBuys))}
            />
        </DashboardLayout>
    );
}
