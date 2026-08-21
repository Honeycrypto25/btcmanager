"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runEvmDcaForUser, reconcileEvmOrdersForUser } from "@/lib/evm/dca";
import { runEvmSweepForUser } from "@/lib/evm/sweep";
import { loadBotWallet } from "@/lib/evm/wallet";
import { MIN_LIMIT_ORDER_USD } from "@/lib/evm/constants";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface EvmSettingsInput {
    enabled: boolean;
    buyAmountUsd: number;
    intervalHours: number;
    takeProfitPercent: number;
    sellAmountUsd: number;
    slippageBps?: number;
    sweepEnabled: boolean;
    sweepMinBalanceWeth: number;
}

export async function getEvmSettings() {
    const userId = await requireUserId();
    return db.evmSettings.findUnique({ where: { userId } });
}

/**
 * The wallet address is never entered by hand — it's derived from
 * BASE_PRIVATE_KEY (set in Vercel env vars) so there's no way for the
 * stored address and the key that actually signs transactions to drift
 * apart.
 */
export async function getBotWalletAddress(): Promise<{ address: string } | { error: string }> {
    await requireUserId();
    try {
        const wallet = loadBotWallet();
        return { address: await wallet.getAddress() };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function upsertEvmSettings(input: EvmSettingsInput) {
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_LIMIT_ORDER_USD) {
        throw new Error(`Suma de vânzare trebuie să fie de cel puțin $${MIN_LIMIT_ORDER_USD}.`);
    }
    if (input.buyAmountUsd <= 0) throw new Error("Suma de cumpărare trebuie să fie pozitivă.");
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.takeProfitPercent <= 0) throw new Error("Procentul țintă trebuie să fie pozitiv.");
    if (input.sweepMinBalanceWeth < 0) throw new Error("Minimul păstrat la retragere nu poate fi negativ.");

    // Derived from the env var, not user input — see getBotWalletAddress().
    const wallet = loadBotWallet();
    const walletAddress = await wallet.getAddress();

    const settings = await db.evmSettings.upsert({
        where: { userId },
        create: {
            userId,
            enabled: input.enabled,
            walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            slippageBps: input.slippageBps ?? 50,
            sweepEnabled: input.sweepEnabled,
            sweepMinBalanceWeth: input.sweepMinBalanceWeth,
        },
        update: {
            enabled: input.enabled,
            walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            slippageBps: input.slippageBps ?? 50,
            sweepEnabled: input.sweepEnabled,
            sweepMinBalanceWeth: input.sweepMinBalanceWeth,
        },
    });

    revalidatePath("/base");
    return settings;
}

export async function listEvmLots() {
    const userId = await requireUserId();
    return db.evmLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } });
}

/** Manual "run now" — same code path as the cron, gated by the same interval check. */
export async function runEvmDcaNow() {
    const userId = await requireUserId();
    const result = await runEvmDcaForUser(userId);
    revalidatePath("/base");
    revalidatePath("/base/stats");
    return result;
}

/** Manual "check orders now" — reconciles pending sell orders against 1inch on demand. */
export async function reconcileEvmOrdersNow() {
    const userId = await requireUserId();
    const result = await reconcileEvmOrdersForUser(userId);
    revalidatePath("/base");
    revalidatePath("/base/stats");
    return result;
}

/**
 * Destination address is display-only here — read straight from the env
 * var (never the database), so the settings page can confirm
 * "yes, BASE_SWEEP_DESTINATION is configured, and it looks like this"
 * without the page needing write access to where funds go.
 */
export async function getSweepDestinationInfo(): Promise<{ address: string } | { error: string }> {
    await requireUserId();
    const raw = process.env.BASE_SWEEP_DESTINATION;
    if (!raw) return { error: "BASE_SWEEP_DESTINATION nu este setat în Vercel." };
    return { address: raw.trim() };
}

/** Manual "Trimite acum" — same transfer logic as the monthly cron, but ignores the "already swept this month" gate. */
export async function runEvmSweepNow() {
    const userId = await requireUserId();
    const result = await runEvmSweepForUser(userId, true);
    revalidatePath("/base");
    revalidatePath("/base/stats");
    return result;
}

export async function listEvmSweeps() {
    const userId = await requireUserId();
    return db.evmSweep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export interface EvmStats {
    totalInvestedUsd: number;
    totalRealizedProceedsUsd: number;
    totalRealizedPnlUsd: number;
    totalFeesUsd: number;
    wethHeld: number;
    openOrders: number;
    filledLots: number;
    totalLots: number;
}

export async function getEvmStats(): Promise<EvmStats> {
    const userId = await requireUserId();
    const lots = await db.evmLot.findMany({ where: { userId } });

    let totalInvestedUsd = 0;
    let totalRealizedProceedsUsd = 0;
    let totalRealizedPnlUsd = 0;
    let totalFeesUsd = 0;
    let wethHeld = 0;
    let openOrders = 0;
    let filledLots = 0;

    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        totalFeesUsd += Number(lot.buyFeeUsd);
        wethHeld += Number(lot.wethRemaining);
        if (lot.status === "OPEN") openOrders++;
        if (lot.status === "FILLED") {
            filledLots++;
            totalRealizedProceedsUsd += Number(lot.sellProceedsUsd ?? 0);
            totalRealizedPnlUsd += Number(lot.realizedPnlUsd ?? 0);
            totalFeesUsd += Number(lot.sellFeeUsd ?? 0);
        }
    }

    return {
        totalInvestedUsd,
        totalRealizedProceedsUsd,
        totalRealizedPnlUsd,
        totalFeesUsd,
        wethHeld,
        openOrders,
        filledLots,
        totalLots: lots.filter((l) => l.status !== "FAILED").length,
    };
}
