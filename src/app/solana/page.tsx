import { getSolanaSettings, getSolanaStats, listSolanaLots } from "@/app/actions/solana";
import { SolanaClient } from "@/components/solana/SolanaClient";
import { getSolPriceUsd } from "@/lib/solana/jupiter";

export default async function SolanaPage() {
    const [settings, lots, stats, solPriceUsd] = await Promise.all([
        getSolanaSettings(),
        listSolanaLots(),
        getSolanaStats(),
        getSolPriceUsd().catch(() => null),
    ]);

    return (
        <SolanaClient
            initialSettings={settings}
            initialLots={JSON.parse(JSON.stringify(lots))}
            initialStats={stats}
            solPriceUsd={solPriceUsd}
        />
    );
}
