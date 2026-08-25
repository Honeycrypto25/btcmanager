"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { runPolygonReverseDcaForSettings, reconcilePolygonOrdersForSettings } from "@/lib/polygon/reverse-dca";
import { runPolygonSweepForUser } from "@/lib/polygon/sweep";
import { loadBotWallet, getUsdcBalance, getNativeBalance, getTokenMeta } from "@/lib/polygon/wallet";
import { ALLOWED_TOKENS, MIN_LIMIT_ORDER_USD } from "@/lib/polygon/constants";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export async function getPolygonBotWalletAddress(): Promise<{ address: string } | { error: string }> {
    await requireUserId();
    try {
        const wallet = loadBotWallet();
        return { address: await wallet.getAddress() };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function listPolygonTokenSettings() {
    const userId = await requireUserId();
    return db.polygonTokenSettings.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

/**
 * Adds a new token bot. Only addresses in ALLOWED_TOKENS can be added (see
 * the comment on that list) — symbol/decimals are read live from the
 * contract rather than trusted from anywhere else, so a stale/wrong guess
 * can never end up baked into the settings row.
 */
export async function addPolygonToken(tokenAddress: string, sellAmountUsd: number, buybackDipPercent: number): Promise<{ id: string } | { error: string }> {
    await requireAdmin();
    const userId = await requireUserId();

    const allowed = ALLOWED_TOKENS.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());
    if (!allowed) return { error: "Adresă necunoscută — adaug-o mai întâi în ALLOWED_TOKENS." };
    if (sellAmountUsd < MIN_LIMIT_ORDER_USD) return { error: `Suma vândută pe ciclu trebuie să fie de cel puțin $${MIN_LIMIT_ORDER_USD}.` };
    if (buybackDipPercent <= 0) return { error: "Procentul de scădere trebuie să fie pozitiv." };

    try {
        const wallet = loadBotWallet();
        const walletAddress = await wallet.getAddress();
        const { symbol, decimals } = await getTokenMeta(allowed.address);

        const settings = await db.polygonTokenSettings.create({
            data: {
                userId,
                enabled: false,
                tokenAddress: allowed.address,
                tokenSymbol: symbol,
                tokenDecimals: decimals,
                walletAddress,
                sellAmountUsd,
                buybackDipPercent,
            },
        });
        revalidatePath("/polygon");
        return { id: settings.id };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export interface PolygonTokenSettingsInput {
    enabled: boolean;
    sellAmountUsd: number;
    intervalHours: number;
    buybackDipPercent: number;
    buybackPercent: number;
    slippageBps?: number;
}

export async function updatePolygonTokenSettings(settingsId: string, input: PolygonTokenSettingsInput) {
    await requireAdmin();
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_LIMIT_ORDER_USD) {
        throw new Error(`Suma vândută pe ciclu trebuie să fie de cel puțin $${MIN_LIMIT_ORDER_USD}.`);
    }
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.buybackDipPercent <= 0) throw new Error("Procentul de scădere pentru răscumpărare trebuie să fie pozitiv.");
    if (input.buybackPercent < 0 || input.buybackPercent > 100) throw new Error("Procentul reinvestit trebuie să fie între 0 și 100.");
    const reinvestedUsd = input.sellAmountUsd * (input.buybackPercent / 100);
    if (reinvestedUsd > 0 && reinvestedUsd < MIN_LIMIT_ORDER_USD) {
        throw new Error(`${input.buybackPercent}% din $${input.sellAmountUsd} e sub minimul de $${MIN_LIMIT_ORDER_USD} pentru un ordin — crește suma vândută sau procentul reinvestit.`);
    }

    const settings = await db.polygonTokenSettings.update({
        where: { id: settingsId, userId },
        data: {
            enabled: input.enabled,
            sellAmountUsd: input.sellAmountUsd,
            intervalHours: input.intervalHours,
            buybackDipPercent: input.buybackDipPercent,
            buybackPercent: input.buybackPercent,
            slippageBps: input.slippageBps ?? 300,
        },
    });

    revalidatePath("/polygon");
    revalidatePath("/polygon/stats");
    return settings;
}

export async function listPolygonLots(settingsId?: string) {
    const userId = await requireUserId();
    return db.polygonTokenLot.findMany({
        where: settingsId ? { userId, settingsId } : { userId },
        orderBy: { soldAt: "desc" },
    });
}

export async function runPolygonDcaNow(settingsId: string) {
    await requireAdmin();
    const result = await runPolygonReverseDcaForSettings(settingsId);
    revalidatePath("/polygon");
    revalidatePath("/polygon/stats");
    return result;
}

export async function reconcilePolygonOrdersNow(settingsId: string) {
    await requireAdmin();
    const result = await reconcilePolygonOrdersForSettings(settingsId);
    revalidatePath("/polygon");
    revalidatePath("/polygon/stats");
    return result;
}

/** Native POL balance — the gas float needed for both the sell swap and placing/filling orders. */
export async function getPolygonGasStatus(): Promise<{ nativeBalance: number } | { error: string }> {
    await requireUserId();
    try {
        const wallet = loadBotWallet();
        const nativeBalance = await getNativeBalance(await wallet.getAddress());
        return { nativeBalance };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function getPolygonUsdcBalance(): Promise<{ usdcBalance: number } | { error: string }> {
    await requireUserId();
    try {
        const wallet = loadBotWallet();
        const usdcBalance = await getUsdcBalance(await wallet.getAddress());
        return { usdcBalance };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

// --- Sweep (per-user, combined across all token bots) ---

export async function getPolygonSweepSettings() {
    const userId = await requireUserId();
    return db.polygonSweepSettings.findUnique({ where: { userId } });
}

export async function updatePolygonSweepSettings(enabled: boolean) {
    await requireAdmin();
    const userId = await requireUserId();
    const settings = await db.polygonSweepSettings.upsert({
        where: { userId },
        create: { userId, enabled },
        update: { enabled },
    });
    revalidatePath("/polygon");
    return settings;
}

export async function getPolygonSweepDestinationInfo(): Promise<{ address: string } | { error: string }> {
    await requireUserId();
    const dest = process.env.POLYGON_SWEEP_DESTINATION;
    if (!dest) return { error: "POLYGON_SWEEP_DESTINATION nu e setat." };
    return { address: dest };
}

export async function runPolygonSweepNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runPolygonSweepForUser(userId, true);
    revalidatePath("/polygon");
    revalidatePath("/polygon/stats");
    return result;
}

export async function listPolygonSweeps() {
    const userId = await requireUserId();
    return db.polygonTokenSweep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

// --- Aggregate stats ---

export interface PolygonStats {
    totalSoldUsd: number;
    totalReinvestedUsd: number;
    totalRealizedProfitUsd: number;
    totalReacquiredCount: number;
    openBuybackOrders: number;
    totalLots: number;
}

export async function getPolygonStats(): Promise<PolygonStats> {
    const userId = await requireUserId();
    const lots = await db.polygonTokenLot.findMany({ where: { userId, status: { not: "FAILED" } } });

    let totalSoldUsd = 0;
    let totalReinvestedUsd = 0;
    let totalRealizedProfitUsd = 0;
    let totalReacquiredCount = 0;
    let openBuybackOrders = 0;

    for (const lot of lots) {
        totalSoldUsd += Number(lot.usdcReceived);
        totalReinvestedUsd += Number(lot.usdcToBuyback);
        totalRealizedProfitUsd += Number(lot.usdcProfit);
        if (lot.status === "OPEN") openBuybackOrders++;
        if (lot.status === "FILLED") totalReacquiredCount++;
    }

    return {
        totalSoldUsd,
        totalReinvestedUsd,
        totalRealizedProfitUsd,
        totalReacquiredCount,
        openBuybackOrders,
        totalLots: lots.length,
    };
}
