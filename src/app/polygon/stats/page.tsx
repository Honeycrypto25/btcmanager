export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listPolygonTokenSettings, listPolygonLots, listPolygonSweeps, getPolygonStats, getPolygonCurrentPrices } from "@/app/actions/polygon";
import { getPolygonUptimes } from "@/lib/bot-uptime";
import { PolygonStatsClient } from "@/components/polygon/PolygonStatsClient";

export default async function PolygonStatsPage() {
    const session = await requireSectionAccess("polygon");
    const userId = (session.user as { id?: string } | undefined)?.id;

    const [tokenSettings, lots, sweeps, stats, currentPrices, uptimes] = await Promise.all([
        listPolygonTokenSettings(),
        listPolygonLots(),
        listPolygonSweeps(),
        getPolygonStats(),
        getPolygonCurrentPrices().catch(() => []),
        userId ? getPolygonUptimes(userId) : Promise.resolve([]),
    ]);

    return (
        <DashboardLayout>
            <PolygonStatsClient
                tokenSettings={JSON.parse(JSON.stringify(tokenSettings))}
                lots={JSON.parse(JSON.stringify(lots))}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                stats={stats}
                currentPrices={currentPrices}
                uptimes={uptimes}
            />
        </DashboardLayout>
    );
}
