export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cachedPageData, sessionUserId } from "@/lib/page-cache";
import { getSolanaStats, listSolanaLots, listSolanaSweeps, getSolanaFuelStatus } from "@/app/actions/solana";
import { SolanaStatsClient } from "@/components/solana/SolanaStatsClient";
import { getSolPriceUsd } from "@/lib/solana/jupiter";
import { getDcaBotUptime } from "@/lib/bot-uptime";
import { listSolanaLimitBuys } from "@/lib/solana/limit-buy";
import { getPriceHistory } from "@/lib/price-history";
import { db } from "@/lib/db";

export default async function SolanaStatsPage() {
    const session = await requireSectionAccess("solana");

    const { lots, stats, solPriceUsd, sweeps, fuelStatus, limitBuys, uptime, daily, limitLots } = await cachedPageData("solana-stats", sessionUserId(session), async () => {
        const userId = (session.user as { id?: string } | undefined)?.id;
        const [lots, stats, solPriceUsd, sweeps, fuelStatus, limitBuys, uptime] = await Promise.all([
            listSolanaLots(),
            getSolanaStats(),
            getSolPriceUsd().catch(() => null),
            listSolanaSweeps(),
            getSolanaFuelStatus(),
            userId ? listSolanaLimitBuys(userId) : Promise.resolve([]),
            userId ? getDcaBotUptime(userId, "SOL") : Promise.resolve(undefined),
        ]);
        // Daily SOL high/low since the first buy, for "where in the day did each buy land".
        const firstBuy = (lots as { boughtAt: Date | string }[]).reduce<number | null>((m, l) => {
            const t = new Date(l.boughtAt).getTime();
            return m === null || t < m ? t : m;
        }, null);
        const [daily, limitFilled] = await Promise.all([
            firstBuy === null ? Promise.resolve(null) : getPriceHistory("SOL", new Date(firstBuy).toISOString().slice(0, 10)),
            userId ? db.solanaBuyOrder.findMany({ where: { userId, lotId: { not: null } }, select: { lotId: true, auto: true } }) : Promise.resolve([]),
        ]);
        // lot id → bought by a limit order (true = automatic dip order)
        const limitLots = Object.fromEntries(limitFilled.map((o) => [o.lotId as string, o.auto]));
        return { lots, stats, solPriceUsd, sweeps, fuelStatus, limitBuys, uptime, daily, limitLots };
    });

    return (
        <DashboardLayout>
            <SolanaStatsClient
                lots={JSON.parse(JSON.stringify(lots))}
                stats={stats}
                solPriceUsd={solPriceUsd}
                sweeps={JSON.parse(JSON.stringify(sweeps))}
                fuelStatus={fuelStatus}
                limitBuys={JSON.parse(JSON.stringify(limitBuys))}
                uptime={uptime}
                daily={daily}
                limitLots={limitLots}
            />
        </DashboardLayout>
    );
}
