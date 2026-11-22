import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cachedPageData, sessionUserId } from "@/lib/page-cache";
import {
    listPolygonTokenSettings,
    listPolygonLots,
    listPolygonSweeps,
    getPolygonStats,
    getPolygonCurrentPrices,
    getPolygonBotWalletAddress,
    getPolygonGasStatus,
    getPolygonUsdcBalance,
    getPolygonSweepSettings,
    getPolygonSweepDestinationInfo,
} from "@/app/actions/polygon";
import { getPolygonUptimes } from "@/lib/bot-uptime";
import { POLYGON_TOKEN_PAGES, type PolygonTokenKey } from "@/lib/polygon/constants";
import { PolygonClient } from "@/components/polygon/PolygonClient";
import { PolygonStatsClient } from "@/components/polygon/PolygonStatsClient";

/**
 * One page per Polygon token bot (GEODNET, MYST). The data is the same as before the split, filtered down to the
 * token's own settings / lots / price / uptime; wallet-level things (USDC sweeps, bot wallet balances) are admin-only
 * because they combine both tokens and a viewer with access to just one token must not see the other's money.
 */

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function PolygonBotPage({ tokenKey }: { tokenKey: PolygonTokenKey }) {
    const token = POLYGON_TOKEN_PAGES[tokenKey];
    const session = await requireSectionAccess(token.section);
    const isAdmin = (session.user as { isAdmin?: boolean } | undefined)?.isAdmin === true;

    const [allSettings, botWallet, gasStatus, usdcStatus, sweepSettings, sweepDestination] = await cachedPageData("polygon", sessionUserId(session), () =>
        Promise.all([
            listPolygonTokenSettings(),
            getPolygonBotWalletAddress(),
            getPolygonGasStatus(),
            getPolygonUsdcBalance(),
            getPolygonSweepSettings(),
            getPolygonSweepDestinationInfo(),
        ]),
    );
    const tokenSettings = allSettings.filter((s) => sameAddress(s.tokenAddress, token.address));

    return (
        <DashboardLayout>
            <PolygonClient
                tokenKey={tokenKey}
                tokenName={token.name}
                tokenAddress={token.address}
                initialTokenSettings={JSON.parse(JSON.stringify(tokenSettings))}
                botWallet={isAdmin ? botWallet : { error: "" }}
                gasStatus={gasStatus}
                usdcStatus={usdcStatus}
                sweepSettings={JSON.parse(JSON.stringify(sweepSettings))}
                sweepDestination={sweepDestination}
            />
        </DashboardLayout>
    );
}

export async function PolygonStatsPage({ tokenKey }: { tokenKey: PolygonTokenKey }) {
    const token = POLYGON_TOKEN_PAGES[tokenKey];
    const session = await requireSectionAccess(token.section);
    const user = session.user as { id?: string; isAdmin?: boolean } | undefined;
    const isAdmin = user?.isAdmin === true;

    const [allSettings, allLots, allSweeps, stats, allPrices, allUptimes] = await cachedPageData("polygon-stats", sessionUserId(session), () =>
        Promise.all([
            listPolygonTokenSettings(),
            listPolygonLots(),
            listPolygonSweeps(),
            getPolygonStats(),
            getPolygonCurrentPrices().catch(() => []),
            user?.id ? getPolygonUptimes(user.id) : Promise.resolve([]),
        ]),
    );

    const tokenSettings = allSettings.filter((s) => sameAddress(s.tokenAddress, token.address));
    const ids = new Set(tokenSettings.map((s) => s.id));
    const lots = allLots.filter((l) => ids.has(l.settingsId));
    const currentPrices = allPrices.filter((p) => ids.has(p.settingsId));
    const uptimes = allUptimes.filter((u) => u.label === token.symbol);

    return (
        <DashboardLayout>
            <PolygonStatsClient
                tokenKey={tokenKey}
                tokenName={token.name}
                tokenSettings={JSON.parse(JSON.stringify(tokenSettings))}
                lots={JSON.parse(JSON.stringify(lots))}
                sweeps={isAdmin ? JSON.parse(JSON.stringify(allSweeps)) : []}
                stats={stats}
                currentPrices={currentPrices}
                uptimes={uptimes}
            />
        </DashboardLayout>
    );
}
