export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBotWalletAddress, getBnbSettings, getSweepDestinationInfo } from "@/app/actions/bnb";
import { BnbClient } from "@/components/bnb/BnbClient";
import { getBnbPriceUsd } from "@/lib/bnb/oneinch";

export default async function BnbPage() {
    const session = await requireSectionAccess("bnb");

    const [settings, bnbPriceUsd, botWallet, sweepDestination] = await Promise.all([
        getBnbSettings(),
        getBnbPriceUsd().catch(() => null),
        getBotWalletAddress(),
        getSweepDestinationInfo(),
    ]);

    return (
        <DashboardLayout>
            <BnbClient
                initialSettings={JSON.parse(JSON.stringify(settings))}
                bnbPriceUsd={bnbPriceUsd}
                botWallet={botWallet}
                sweepDestination={sweepDestination}
            />
        </DashboardLayout>
    );
}
