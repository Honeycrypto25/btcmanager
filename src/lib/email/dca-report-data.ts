import "server-only";
import { db } from "@/lib/db";
import { getSolPriceUsd, getTokenPriceUsd } from "@/lib/solana/jupiter";
import { getWethPriceUsd } from "@/lib/evm/oneinch";
import { loadBotKeypair, getUsdcBalance as getSolanaUsdcBalance } from "@/lib/solana/wallet";
import { loadBotWallet, getUsdcBalance as getEvmUsdcBalance } from "@/lib/evm/wallet";
import { getBnbPriceUsd } from "@/lib/bnb/oneinch";
import { loadBotWallet as loadBnbBotWallet, getUsdtBalance as getBnbUsdtBalance } from "@/lib/bnb/wallet";
import { EVA_MINT } from "@/lib/solana/constants";

export interface DcaReportAsset {
    label: string;
    heldAmount: number;
    heldUnit: string;
    heldValueUsd: number | null;
    totalInvestedUsd: number;
    totalRealizedPnlUsd: number;
    daysOfFuel: number | null;
}

/**
 * DCA bot summaries for the weekly/monthly report emails. Like
 * getOverviewData(), this is deliberately NOT scoped to a specific userId —
 * the whole report (and this app generally) is built around a single
 * deployment/household, not multiple independent tenants (see the schema
 * comment on SolanaSettings/EvmSettings and the single SOLANA_PRIVATE_KEY /
 * BASE_PRIVATE_KEY env vars — there is exactly one bot wallet of each kind
 * per deployment). findFirst() picks up whichever settings row exists.
 *
 * Returns null when the bot was never configured (no settings row) — the
 * report simply omits that card, same pattern as data.t212.connected /
 * vanguard.accountCount > 0 for the other asset cards. A configured-but-
 * disabled bot still shows (so "I turned it off" is visible in the report,
 * not silently dropped).
 */
export async function getSolanaDcaReportData(): Promise<DcaReportAsset | null> {
    const settings = await db.solanaSettings.findFirst();
    if (!settings) return null;

    const lots = await db.solanaLot.findMany();
    let totalInvestedUsd = 0;
    let totalRealizedPnlUsd = 0;
    let solHeld = 0;
    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        solHeld += Number(lot.solRemaining);
        if (lot.status === "FILLED") totalRealizedPnlUsd += Number(lot.realizedPnlUsd ?? 0);
    }

    const solPriceUsd = await getSolPriceUsd().catch(() => null);

    let daysOfFuel: number | null = null;
    try {
        const keypair = loadBotKeypair();
        const usdcBalance = await getSolanaUsdcBalance(keypair.publicKey.toBase58());
        const buyAmountUsd = Number(settings.buyAmountUsd);
        if (buyAmountUsd > 0) {
            daysOfFuel = Math.floor(usdcBalance / buyAmountUsd) * (settings.intervalHours / 24);
        }
    } catch {
        // SOLANA_PRIVATE_KEY not set, or RPC unreachable — omit the fuel line rather than fail the whole report.
    }

    return {
        label: "Solana DCA",
        heldAmount: solHeld,
        heldUnit: "SOL",
        heldValueUsd: solPriceUsd !== null ? solHeld * solPriceUsd : null,
        totalInvestedUsd,
        totalRealizedPnlUsd,
        daysOfFuel,
    };
}

export async function getEvmDcaReportData(): Promise<DcaReportAsset | null> {
    const settings = await db.evmSettings.findFirst();
    if (!settings) return null;

    const lots = await db.evmLot.findMany();
    let totalInvestedUsd = 0;
    let totalRealizedPnlUsd = 0;
    let wethHeld = 0;
    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        wethHeld += Number(lot.wethRemaining);
        if (lot.status === "FILLED") totalRealizedPnlUsd += Number(lot.realizedPnlUsd ?? 0);
    }

    const wethPriceUsd = await getWethPriceUsd().catch(() => null);

    let daysOfFuel: number | null = null;
    try {
        const wallet = loadBotWallet();
        const usdcBalance = await getEvmUsdcBalance(await wallet.getAddress());
        const buyAmountUsd = Number(settings.buyAmountUsd);
        if (buyAmountUsd > 0) {
            daysOfFuel = Math.floor(usdcBalance / buyAmountUsd) * (settings.intervalHours / 24);
        }
    } catch {
        // BASE_PRIVATE_KEY not set, or RPC unreachable — omit the fuel line rather than fail the whole report.
    }

    return {
        label: "Base DCA",
        heldAmount: wethHeld,
        heldUnit: "WETH",
        heldValueUsd: wethPriceUsd !== null ? wethHeld * wethPriceUsd : null,
        totalInvestedUsd,
        totalRealizedPnlUsd,
        daysOfFuel,
    };
}

export async function getBnbDcaReportData(): Promise<DcaReportAsset | null> {
    const settings = await db.bnbSettings.findFirst();
    if (!settings) return null;

    const lots = await db.bnbLot.findMany();
    let totalInvestedUsd = 0;
    let totalRealizedPnlUsd = 0;
    let bnbHeld = 0;
    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        bnbHeld += Number(lot.bnbRemaining);
        if (lot.status === "FILLED") totalRealizedPnlUsd += Number(lot.realizedPnlUsd ?? 0);
    }

    const bnbPriceUsd = await getBnbPriceUsd().catch(() => null);

    let daysOfFuel: number | null = null;
    try {
        const wallet = loadBnbBotWallet();
        const usdtBalance = await getBnbUsdtBalance(await wallet.getAddress());
        const buyAmountUsd = Number(settings.buyAmountUsd);
        if (buyAmountUsd > 0) {
            daysOfFuel = Math.floor(usdtBalance / buyAmountUsd) * (settings.intervalHours / 24);
        }
    } catch {
        // BASE_PRIVATE_KEY not set, or RPC unreachable — omit the fuel line rather than fail the whole report.
    }

    return {
        label: "BNB Chain DCA",
        heldAmount: bnbHeld,
        heldUnit: "WBNB",
        heldValueUsd: bnbPriceUsd !== null ? bnbHeld * bnbPriceUsd : null,
        totalInvestedUsd,
        totalRealizedPnlUsd,
        daysOfFuel,
    };
}


/**
 * EVA -- same buy-DCA + take-profit-sell shape as Solana/Base/BNB above
 * (EvaLot mirrors SolanaLot/EvmLot/BnbLot field-for-field), just a
 * different SPL token traded from the SAME wallet as the Solana bot (see
 * the walletAddress comment on EvaSettings) -- so "days of fuel" reads the
 * same shared USDC balance the Solana card also reads, just divided by
 * EVA's own buyAmountUsd/intervalHours rather than Solana's.
 */
export async function getEvaDcaReportData(): Promise<DcaReportAsset | null> {
    const settings = await db.evaSettings.findFirst();
    if (!settings) return null;

    const lots = await db.evaLot.findMany();
    let totalInvestedUsd = 0;
    let totalRealizedPnlUsd = 0;
    let evaHeld = 0;
    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        evaHeld += Number(lot.evaRemaining);
        if (lot.status === "FILLED") totalRealizedPnlUsd += Number(lot.realizedPnlUsd ?? 0);
    }

    const evaPriceUsd = await getTokenPriceUsd(EVA_MINT).catch(() => null);

    let daysOfFuel: number | null = null;
    try {
        const keypair = loadBotKeypair();
        const usdcBalance = await getSolanaUsdcBalance(keypair.publicKey.toBase58());
        const buyAmountUsd = Number(settings.buyAmountUsd);
        if (buyAmountUsd > 0) {
            daysOfFuel = Math.floor(usdcBalance / buyAmountUsd) * (settings.intervalHours / 24);
        }
    } catch {
        // SOLANA_PRIVATE_KEY not set, or RPC unreachable -- omit the fuel line rather than fail the whole report.
    }

    return {
        label: "EVA DCA",
        heldAmount: evaHeld,
        heldUnit: "EVA",
        heldValueUsd: evaPriceUsd !== null ? evaHeld * evaPriceUsd : null,
        totalInvestedUsd,
        totalRealizedPnlUsd,
        daysOfFuel,
    };
}

/**
 * Polygon reverse-DCA summary for the report emails. Doesn't fit the
 * DcaReportAsset shape used by Solana/Base/BNB/EVA above: those are all
 * "buy one token steadily with capital" bots with a single held asset,
 * while Polygon SELLS externally-received tokens (GEOD, MYST, ... -- one
 * PolygonTokenSettings row per token, see the schema comment) for USDC and
 * buys back at a dip, so there's no single "amount held" or "days of
 * fuel" figure -- see getPolygonStats() in src/app/actions/polygon.ts for
 * the same aggregation, session-scoped; this mirrors it without the
 * session (cron-triggered reports have none, same reasoning as the other
 * DCA report functions above).
 */
export interface PolygonDcaReportSummary {
    label: string;
    tokenCount: number;
    totalSoldUsd: number;
    totalReinvestedUsd: number;
    totalRealizedProfitUsd: number;
    openBuybackOrders: number;
    totalReacquiredCount: number;
}

export async function getPolygonDcaReportData(): Promise<PolygonDcaReportSummary | null> {
    const settingsRows = await db.polygonTokenSettings.findMany();
    if (settingsRows.length === 0) return null;

    const lots = await db.polygonTokenLot.findMany({ where: { status: { not: "FAILED" } } });

    let totalSoldUsd = 0;
    let totalReinvestedUsd = 0;
    let totalRealizedProfitUsd = 0;
    let openBuybackOrders = 0;
    let totalReacquiredCount = 0;

    for (const lot of lots) {
        totalSoldUsd += Number(lot.usdcReceived);
        totalReinvestedUsd += Number(lot.usdcToBuyback);
        totalRealizedProfitUsd += Number(lot.usdcProfit);
        if (lot.status === "OPEN") openBuybackOrders++;
        if (lot.status === "FILLED") totalReacquiredCount++;
    }

    return {
        label: "Polygon Reverse-DCA",
        tokenCount: settingsRows.length,
        totalSoldUsd,
        totalReinvestedUsd,
        totalRealizedProfitUsd,
        openBuybackOrders,
        totalReacquiredCount,
    };
}
