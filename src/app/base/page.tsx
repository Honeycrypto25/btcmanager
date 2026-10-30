export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBotWalletAddress, getEvmSettings, getSweepDestinationInfo } from "@/app/actions/evm";
import { EvmClient } from "@/components/evm/EvmClient";
import { getWethPriceUsd } from "@/lib/evm/oneinch";
import { listEvmLimitBuys } from "@/lib/evm/limit-buy";

export default async function BasePage() {
    const session = await requireSectionAccess("base");

    const userId = (session.user as { id?: string } | undefined)?.id;
    const [settings, wethPriceUsd, botWallet, sweepDestination, limitBuys] = await Promise.all([
        getEvmSettings(),
        getWethPriceUsd().catch(() => null),
        getBotWalletAddress(),
        getSweepDestinationInfo(),
        userId ? listEvmLimitBuys(userId) : Promise.resolve([]),
    ]);

    return (
        <DashboardLayout>
            <EvmClient
                initialSettings={JSON.parse(JSON.stringify(settings))}
                wethPriceUsd={wethPriceUsd}
                botWallet={botWallet}
                sweepDestination={sweepDestination}
                limitBuys={JSON.parse(JSON.stringify(limitBuys))}
            />
        </DashboardLayout>
    );
}
