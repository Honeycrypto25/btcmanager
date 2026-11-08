export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getLendOverview } from "@/lib/solana/jupiter-lend";
import { LendPositions } from "@/components/cold-wallet/LendPositions";
import { LendCharts } from "@/components/cold-wallet/LendCharts";

// Admin-only, like the rest of the Cold wallet section. Read-only: it only
// reads Jupiter Lend (positions) and Fluid (history) for the wallets in
// JUPITER_LEND_WALLETS. Neither call can fail the page — errors show as a note.
export default async function ColdWalletLoansPage() {
    await requireAdminPage();
    const lend = await getLendOverview({ record: true });

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Împrumuturi</h1>
                    <p className="text-sm text-muted">Pozițiile de împrumut Jupiter Lend din cold wallet — colateral, datorie, dobânzi și cât de departe e lichidarea.</p>
                </div>
                <LendPositions lend={lend} />
                {lend.positions.map((p) => (
                    <LendCharts key={`${p.vaultId}-${p.id}`} p={p} fetchedAt={lend.fetchedAt} />
                ))}
            </div>
        </DashboardLayout>
    );
}
