export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getLendPositions } from "@/lib/solana/jupiter-lend";
import { LendPositions } from "@/components/cold-wallet/LendPositions";

// Admin-only, like the rest of the Cold wallet section. Read-only: it only
// queries Jupiter Lend for the positions owned by JUPITER_LEND_WALLETS.
export default async function ColdWalletLoansPage() {
    await requireAdminPage();
    const lend = await getLendPositions();

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Împrumuturi</h1>
                    <p className="text-sm text-muted">Pozițiile de împrumut Jupiter Lend din cold wallet — colateral, datorie și cât de departe e lichidarea.</p>
                </div>
                <LendPositions lend={lend} />
            </div>
        </DashboardLayout>
    );
}
