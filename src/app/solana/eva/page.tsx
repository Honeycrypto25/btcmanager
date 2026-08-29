export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBotWalletAddress, getEvaSettings, getSweepDestinationInfo } from "@/app/actions/eva";
import { EvaClient } from "@/components/eva/EvaClient";
import { getTokenPriceUsd } from "@/lib/solana/jupiter";
import { EVA_MINT } from "@/lib/solana/constants";

export default async function EvaPage() {
    // Nested under the Solana section (/solana/eva) — same "solana"
    // permission key as /solana and /solana/stats gates this, since
    // requireSectionAccess checks the section key directly rather than
    // matching by path prefix. No new section/permission key needed.
    await requireSectionAccess("solana");

    const [settings, evaPriceUsd, botWallet, sweepDestination] = await Promise.all([
        getEvaSettings(),
        getTokenPriceUsd(EVA_MINT).catch(() => null),
        getBotWalletAddress(),
        getSweepDestinationInfo(),
    ]);

    return (
        <DashboardLayout>
            <EvaClient
                initialSettings={JSON.parse(JSON.stringify(settings))}
                evaPriceUsd={evaPriceUsd}
                botWallet={botWallet}
                sweepDestination={sweepDestination}
            />
        </DashboardLayout>
    );
}
