export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getEvaStats, listEvaLots, listEvaSweeps, getEvaFuelStatus } from "@/app/actions/eva";
import { EvaStatsClient } from "@/components/eva/EvaStatsClient";
import { getTokenPriceUsd } from "@/lib/solana/jupiter";
import { getDcaBotUptime } from "@/lib/bot-uptime";
import { EVA_MINT } from "@/lib/solana/constants";

export default async function EvaStatsPage() {
    const session = await requireSectionAccess("solana");
    const userId = (session.user as { id?: string } | undefined)?.id;

    const [lots, stats, evaPriceUsd, sweeps, fuelStatus, uptime] = await Promise.all([
        listEvaLots(),
        getEvaStats(),
        getTokenPriceUsd(EVA_MINT).catch(() => null),
        listEvaSweeps(),
        getEvaFuelStatus(),
        userId ? getDcaBotUptime(userId, "EVA") : Promise.resolve(undefined),
    ]);

    return (
        <DashboardLayout>
            <EvaStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                evaPriceUsd={evaPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                fuelStatus={fuelStatus}
                uptime={uptime}
            />
        </DashboardLayout>
    );
}
