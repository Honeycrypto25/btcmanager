export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getLendOverview } from "@/lib/solana/jupiter-lend";
import { LendTransactions } from "@/components/cold-wallet/LendTransactions";

// Admin-only. History comes from Fluid's public API (what jup.ag's History tab reads).
export default async function LendTransactionsPage() {
    await requireAdminPage();
    const lend = await getLendOverview();

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <Link href="/cold-wallet/imprumuturi" className="text-xs text-primary-strong hover:underline">
                        ← Împrumuturi
                    </Link>
                    <h1 className="font-display text-2xl font-medium text-foreground">Tranzacții împrumuturi</h1>
                    <p className="text-sm text-muted">Depuneri, împrumuturi, rambursări și retrageri pe pozițiile Jupiter Lend, cu valoarea în $ din momentul tranzacției.</p>
                </div>
                <LendTransactions lend={lend} />
            </div>
        </DashboardLayout>
    );
}
