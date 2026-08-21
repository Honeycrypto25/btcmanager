export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBotWalletAddress, getEvmSettings, getSweepDestinationInfo } from "@/app/actions/evm";
import { EvmClient } from "@/components/evm/EvmClient";
import { getWethPriceUsd } from "@/lib/evm/oneinch";

export default async function BasePage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const [settings, wethPriceUsd, botWallet, sweepDestination] = await Promise.all([
        getEvmSettings(),
        getWethPriceUsd().catch(() => null),
        getBotWalletAddress(),
        getSweepDestinationInfo(),
    ]);

    return (
        <DashboardLayout>
            <EvmClient
                initialSettings={JSON.parse(JSON.stringify(settings))}
                wethPriceUsd={wethPriceUsd}
                botWallet={botWallet}
                sweepDestination={sweepDestination}
            />
        </DashboardLayout>
    );
}
