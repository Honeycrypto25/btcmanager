export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getSolanaStats, listSolanaLots, listSolanaSweeps, getSolanaFuelStatus } from "@/app/actions/solana";
import { SolanaStatsClient } from "@/components/solana/SolanaStatsClient";
import { getSolPriceUsd } from "@/lib/solana/jupiter";

export default async function SolanaStatsPage() {
    const session = await requireSectionAccess("solana");

    const [lots, stats, solPriceUsd, sweeps, fuelStatus] = await Promise.all([
        listSolanaLots(),
        getSolanaStats(),
        getSolPriceUsd().catch(() => null),
        listSolanaSweeps(),
        getSolanaFuelStatus(),
    ]);

    return (
        <DashboardLayout>
            <SolanaStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                solPriceUsd={solPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                fuelStatus={fuelStatus}
            />
        </DashboardLayout>
    );
}
