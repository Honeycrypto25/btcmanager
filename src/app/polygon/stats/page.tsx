export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listPolygonTokenSettings, listPolygonLots, listPolygonSweeps, getPolygonStats } from "@/app/actions/polygon";
import { PolygonStatsClient } from "@/components/polygon/PolygonStatsClient";

export default async function PolygonStatsPage() {
    await requireSectionAccess("polygon");

    const [tokenSettings, lots, sweeps, stats] = await Promise.all([
        listPolygonTokenSettings(),
        listPolygonLots(),
        listPolygonSweeps(),
        getPolygonStats(),
    ]);

    return (
        <DashboardLayout>
            <PolygonStatsClient
                tokenSettings={JSON.parse(JSON.stringify(tokenSettings))}
                lots={JSON.parse(JSON.stringify(lots))}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                stats={stats}
            />
        </DashboardLayout>
    );
}
