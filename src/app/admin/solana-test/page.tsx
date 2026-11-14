export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { testWalletInfo } from "@/lib/solana/v3/test-ops";
import { SolanaTestClient } from "@/components/admin/SolanaTestClient";

// Test bench for the @solana/web3.js v1 -> v3 upgrade. Uses ONLY the dedicated test wallet.
export default async function SolanaTestPage() {
    await requireAdminPage();
    const wallet = await testWalletInfo();
    return (
        <DashboardLayout>
            <SolanaTestClient wallet={wallet} />
        </DashboardLayout>
    );
}
