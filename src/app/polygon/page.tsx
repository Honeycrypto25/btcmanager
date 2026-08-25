export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
    listPolygonTokenSettings,
    getPolygonBotWalletAddress,
    getPolygonGasStatus,
    getPolygonUsdcBalance,
    getPolygonSweepSettings,
    getPolygonSweepDestinationInfo,
} from "@/app/actions/polygon";
import { PolygonClient } from "@/components/polygon/PolygonClient";

export default async function PolygonPage() {
    await requireSectionAccess("polygon");

    const [tokenSettings, botWallet, gasStatus, usdcStatus, sweepSettings, sweepDestination] = await Promise.all([
        listPolygonTokenSettings(),
        getPolygonBotWalletAddress(),
        getPolygonGasStatus(),
        getPolygonUsdcBalance(),
        getPolygonSweepSettings(),
        getPolygonSweepDestinationInfo(),
    ]);

    return (
        <DashboardLayout>
            <PolygonClient
                initialTokenSettings={JSON.parse(JSON.stringify(tokenSettings))}
                botWallet={botWallet}
                gasStatus={gasStatus}
                usdcStatus={usdcStatus}
                sweepSettings={JSON.parse(JSON.stringify(sweepSettings))}
                sweepDestination={sweepDestination}
            />
        </DashboardLayout>
    );
}
