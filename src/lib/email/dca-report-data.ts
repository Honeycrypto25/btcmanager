import "server-only";
import { db } from "@/lib/db";
import { getSolPriceUsd } from "@/lib/solana/jupiter";
import { getWethPriceUsd } from "@/lib/evm/oneinch";
import { loadBotKeypair, getUsdcBalance as getSolanaUsdcBalance } from "@/lib/solana/wallet";
import { loadBotWallet, getUsdcBalance as getEvmUsdcBalance } from "@/lib/evm/wallet";
import { getBnbPriceUsd } from "@/lib/bnb/oneinch";
import { loadBotWallet as loadBnbBotWallet, getUsdtBalance as getBnbUsdtBalance } from "@/lib/bnb/wallet";

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
