export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getLendOverview } from "@/lib/solana/jupiter-lend";
import { LendTransactions, type SweepDeposit, type PlatformRepay } from "@/components/cold-wallet/LendTransactions";
import { db } from "@/lib/db";

// Admin-only. History comes from Fluid's public API (what jup.ag's History tab reads).
// Deposits that came from the bot's monthly sweep (target "Împrumut") are matched by transaction signature.
export default async function LendTransactionsPage({ searchParams }: { searchParams: Promise<{ sweep?: string; tx?: string }> }) {
    const session = await requireAdminPage();
    const { sweep, tx } = await searchParams;
    const userId = (session.user as { id?: string } | undefined)?.id;
    const [lend, sweepRows, repayRows] = await Promise.all([
        getLendOverview(),
        userId
            ? db.solanaSweep.findMany({
                  where: { userId, target: "lend", status: "SUCCESS", txSignature: { not: null } },
                  select: { txSignature: true, manual: true, amountSol: true, createdAt: true },
              })
            : Promise.resolve([]),
        userId ? db.solanaLendRepay.findMany({ where: { userId }, select: { txSignature: true, amountUsdc: true } }) : Promise.resolve([]),
    ]);
    const repays: Record<string, PlatformRepay> = {};
    for (const r of repayRows) repays[r.txSignature] = { amountUsdc: Number(r.amountUsdc) };
    const sweeps: Record<string, SweepDeposit> = {};
    for (const r of sweepRows) if (r.txSignature) sweeps[r.txSignature] = { manual: r.manual, amountSol: Number(r.amountSol), at: r.createdAt.toISOString() };

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
                <LendTransactions lend={lend} sweeps={sweeps} repays={repays} initialSweepOnly={sweep === "1"} highlightSig={tx} />
            </div>
        </DashboardLayout>
    );
}
