export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getLendOverview } from "@/lib/solana/jupiter-lend";
import { LendPositions } from "@/components/cold-wallet/LendPositions";
import { LendCharts } from "@/components/cold-wallet/LendCharts";
import { LendBotFuel, type BotOverview } from "@/components/cold-wallet/LendBotFuel";
import { listSolanaLots, getSolanaFuelStatus } from "@/app/actions/solana";
import { getSolPriceUsd } from "@/lib/solana/jupiter";
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

    let pending: BotOverview["pending"] = null;
    if (lotsRes.status === "fulfilled") {
        const open = lotsRes.value.filter((l: { status: string }) => PENDING_STATUSES.has(l.status));
        const sol = open.reduce((s: number, l: { solRemaining: unknown }) => s + Number(l.solRemaining), 0);
        pending = { count: open.length, sol, usd: solPriceUsd != null ? sol * solPriceUsd : 0 };
    }
    return { fuel, fuelError, pending, solPriceUsd };
}

// Admin-only, like the rest of the Cold wallet section. Read-only: it only
// reads Jupiter Lend (positions) and Fluid (history) for the wallets in
// JUPITER_LEND_WALLETS. Neither call can fail the page — errors show as a note.
// Own LTV ceiling for new borrowing, set in Vercel as LEND_MAX_LTV (e.g. 30 or 0.3). Defaults to 30%.
function lendCapLtv(): number {
    const raw = Number(process.env.LEND_MAX_LTV);
    if (!Number.isFinite(raw) || raw <= 0) return 0.3;
    return raw > 1 ? Math.min(raw / 100, 0.95) : Math.min(raw, 0.95);
}

export default async function ColdWalletLoansPage() {
    await requireAdminPage();
    const [lend, bot] = await Promise.all([getLendOverview({ record: true }), getBotOverview()]);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Împrumuturi</h1>
                    <p className="text-sm text-muted">Pozițiile de împrumut Jupiter Lend din cold wallet — colateral, datorie, dobânzi și cât de departe e lichidarea.</p>
                </div>
                <LendPositions lend={lend} capLtv={lendCapLtv()} />
                <LendBotFuel bot={bot} />
                {lend.positions.map((p) => (
                    <LendCharts key={`${p.vaultId}-${p.id}`} p={p} fetchedAt={lend.fetchedAt} />
                ))}
            </div>
        </DashboardLayout>
    );
}
