export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBotWalletAddress, getSolanaSettings, getSweepDestinationInfo } from "@/app/actions/solana";
import { SolanaClient } from "@/components/solana/SolanaClient";
import { getSolPriceUsd } from "@/lib/solana/jupiter";

export default async function SolanaPage() {
    const session = await requireSectionAccess("solana");

    const [settings, solPriceUsd, botWallet, sweepDestination] = await Promise.all([
        getSolanaSettings(),
        getSolPriceUsd().catch(() => null),
        getBotWalletAddress(),
        getSweepDestinationInfo(),
    ]);

    return (
        <DashboardLayout>
            <SolanaClient
                initialSettings={JSON.parse(JSON.stringify(settings))}
                solPriceUsd={solPriceUsd}
                botWallet={botWallet}
                sweepDestination={sweepDestination}
            />
        </DashboardLayout>
    );
}
