export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getLendOverview } from "@/lib/solana/jupiter-lend";
import { LendPositions } from "@/components/cold-wallet/LendPositions";
import { LendCharts } from "@/components/cold-wallet/LendCharts";
import { LendAlert, LendPlanner } from "@/components/cold-wallet/LendPlanner";
import { LoansRefreshButton } from "@/components/cold-wallet/LoansRefreshButton";
import { LendBotFuel, type BotOverview } from "@/components/cold-wallet/LendBotFuel";
import { listSolanaLots, getSolanaFuelStatus } from "@/app/actions/solana";
import { getSolPriceUsd } from "@/lib/solana/jupiter";
import { lendCapLtv } from "@/lib/solana/lend-config";
import { checkLendAlerts } from "@/lib/email/lend-alert";
import { PENDING_STATUSES } from "@/components/solana/shared";

/** Bot wallet USDC + SOL waiting in sell orders. Never throws — the loan page must load without it. */
async function getBotOverview(): Promise<BotOverview> {
    const [fuelRes, lotsRes, priceRes] = await Promise.allSettled([getSolanaFuelStatus(), listSolanaLots(), getSolPriceUsd()]);
    const solPriceUsd = priceRes.status === "fulfilled" ? priceRes.value : null;
    let fuel: BotOverview["fuel"] = null;
    let fuelError: string | null = null;
    if (fuelRes.status === "fulfilled") {
        if ("error" in fuelRes.value) fuelError = fuelRes.value.error;
        else {
            const { usdcBalance, buyAmountUsd, intervalHours, projected } = fuelRes.value;
            fuel = { usdcBalance, buyAmountUsd, intervalHours, projected };
        }
    } else fuelError = fuelRes.reason instanceof Error ? fuelRes.reason.message : String(fuelRes.reason);

    let realized30d: BotOverview["realized30d"] = null;
    if (lotsRes.status === "fulfilled") {
        const since = Date.now() - 30 * 24 * 3600 * 1000;
        const sold = lotsRes.value.filter((l: { status: string; soldAt: Date | string | null }) => l.status === "FILLED" && l.soldAt != null && new Date(l.soldAt).getTime() >= since);
        realized30d = { usd: sold.reduce((s: number, l: { realizedPnlUsd: unknown }) => s + Number(l.realizedPnlUsd ?? 0), 0), count: sold.length };
    }

    let pending: BotOverview["pending"] = null;
    if (lotsRes.status === "fulfilled") {
        const open = lotsRes.value.filter((l: { status: string }) => PENDING_STATUSES.has(l.status));
        const sol = open.reduce((s: number, l: { solRemaining: unknown }) => s + Number(l.solRemaining), 0);
        pending = { count: open.length, sol, usd: solPriceUsd != null ? sol * solPriceUsd : 0 };
    }
    return { fuel, fuelError, pending, realized30d, solPriceUsd };
}

// Admin-only, like the rest of the Cold wallet section. Read-only: it only
// reads Jupiter Lend (positions) and Fluid (history) for the wallets in
// JUPITER_LEND_WALLETS. Neither call can fail the page — errors show as a note.
export default async function ColdWalletLoansPage() {
    await requireAdminPage();
    const [lend, bot] = await Promise.all([getLendOverview({ record: true }), getBotOverview()]);
    const capLtv = lendCapLtv();
    // Opening the page also checks the LTV steps (deduped, never blocks the page).
    await checkLendAlerts(lend.positions, capLtv).catch(() => null);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="font-display text-2xl font-medium text-foreground">Împrumuturi</h1>
                        <p className="text-sm text-muted">Pozițiile de împrumut Jupiter Lend din cold wallet — colateral, datorie, dobânzi și cât de departe e lichidarea.</p>
                    </div>
                    <LoansRefreshButton />
                </div>
                <LendAlert positions={lend.positions} capLtv={capLtv} />
                <LendPositions lend={lend} capLtv={capLtv} />
                <LendBotFuel bot={bot} />
                {lend.positions[0] && <LendPlanner p={lend.positions[0]} bot={bot} capLtv={capLtv} />}
                {lend.positions.map((p) => (
                    <LendCharts key={`${p.vaultId}-${p.id}`} p={p} fetchedAt={lend.fetchedAt} capLtv={capLtv} />
                ))}
            </div>
        </DashboardLayout>
    );
}
