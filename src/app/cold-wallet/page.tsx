export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getColdWalletData } from "@/app/actions/cold-wallet";
import { ColdWalletClient } from "@/components/cold-wallet/ColdWalletClient";

// Admin-only: it aggregates sweeps from every bot section (Solana, Base,
// BNB, Polygon), so a viewer with access to only some of them would see
// figures from sections they don't have — same reasoning as Overview.
export default async function ColdWalletPage() {
    await requireAdminPage();
    const data = await getColdWalletData();

    return (
        <DashboardLayout>
            <ColdWalletClient data={data} />
        </DashboardLayout>
    );
}
