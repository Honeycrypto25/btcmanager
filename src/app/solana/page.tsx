export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBotWalletAddress, getSolanaSettings, getSweepDestinationInfo } from "@/app/actions/solana";
import { SolanaClient } from "@/components/solana/SolanaClient";
import { getSolPriceUsd } from "@/lib/solana/jupiter";
import { listSolanaLimitBuys } from "@/lib/solana/limit-buy";
import { db } from "@/lib/db";

export default async function SolanaPage() {
    const session = await requireSectionAccess("solana");

    const userId = (session.user as { id?: string } | undefined)?.id;
    const [settings, solPriceUsd, botWallet, sweepDestination, limitBuys, lastLot] = await Promise.all([
        getSolanaSettings(),
        getSolPriceUsd().catch(() => null),
        getBotWalletAddress(),
        getSweepDestinationInfo(),
        userId ? listSolanaLimitBuys(userId) : Promise.resolve([]),
        userId
            ? db.solanaLot.findFirst({ where: { userId, status: { in: ["OPEN", "FILLED", "PENDING_SELL_ORDER"] } }, orderBy: { boughtAt: "desc" }, select: { buyPriceUsd: true } })
            : Promise.resolve(null),
    ]);

    return (
        <DashboardLayout>
            <SolanaClient
                initialSettings={JSON.parse(JSON.stringify(settings))}
                solPriceUsd={solPriceUsd}
                botWallet={botWallet}
                sweepDestination={sweepDestination}
                limitBuys={JSON.parse(JSON.stringify(limitBuys))}
                lastBuyPriceUsd={lastLot ? Number(lastLot.buyPriceUsd) : null}
            />
        </DashboardLayout>
    );
}
