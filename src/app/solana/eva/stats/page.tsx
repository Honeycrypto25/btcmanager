export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getEvaStats, listEvaLots, listEvaSweeps, getEvaFuelStatus } from "@/app/actions/eva";
import { EvaStatsClient } from "@/components/eva/EvaStatsClient";
import { getTokenPriceUsd } from "@/lib/solana/jupiter";
import { EVA_MINT } from "@/lib/solana/constants";

export default async function EvaStatsPage() {
    await requireSectionAccess("solana");

    const [lots, stats, evaPriceUsd, sweeps, fuelStatus] = await Promise.all([
        listEvaLots(),
        getEvaStats(),
        getTokenPriceUsd(EVA_MINT).catch(() => null),
        listEvaSweeps(),
        getEvaFuelStatus(),
    ]);

    return (
        <DashboardLayout>
            <EvaStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                evaPriceUsd={evaPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                fuelStatus={fuelStatus}
            />
        </DashboardLayout>
    );
}
