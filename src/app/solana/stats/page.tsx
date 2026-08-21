export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getSolanaStats, listSolanaLots, listSolanaSweeps } from "@/app/actions/solana";
import { SolanaStatsClient } from "@/components/solana/SolanaStatsClient";
import { getSolPriceUsd } from "@/lib/solana/jupiter";

export default async function SolanaStatsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const [lots, stats, solPriceUsd, sweeps] = await Promise.all([
        listSolanaLots(),
        getSolanaStats(),
        getSolPriceUsd().catch(() => null),
        listSolanaSweeps(),
    ]);

    return (
        <DashboardLayout>
            <SolanaStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                solPriceUsd={solPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
            />
        </DashboardLayout>
    );
}
