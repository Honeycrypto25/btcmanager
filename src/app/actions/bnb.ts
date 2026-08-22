"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { runBnbDcaForUser, reconcileBnbOrdersForUser } from "@/lib/bnb/dca";
import { runBnbSweepForUser } from "@/lib/bnb/sweep";
import { loadBotWallet, getUsdtBalance } from "@/lib/bnb/wallet";
import { MIN_LIMIT_ORDER_USD } from "@/lib/bnb/constants";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface BnbSettingsInput {
    enabled: boolean;
    buyAmountUsd: number;
    intervalHours: number;
    takeProfitPercent: number;
    sellAmountUsd: number;
    slippageBps?: number;
    sweepEnabled: boolean;
    sweepMinBalanceBnb: number;
}

export async function getBnbSettings() {
    const userId = await requireUserId();
    return db.bnbSettings.findUnique({ where: { userId } });
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

export async function upsertBnbSettings(input: BnbSettingsInput) {
    await requireAdmin();
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_LIMIT_ORDER_USD) {
        throw new Error(`Suma de vânzare trebuie să fie de cel puțin $${MIN_LIMIT_ORDER_USD}.`);
    }
    if (input.buyAmountUsd <= 0) throw new Error("Suma de cumpărare trebuie să fie pozitivă.");
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.takeProfitPercent <= 0) throw new Error("Procentul țintă trebuie să fie pozitiv.");
    if (input.sweepMinBalanceBnb < 0) throw new Error("Minimul păstrat la retragere nu poate fi negativ.");

    // Derived from the env var, not user input — see getBotWalletAddress().
    const wallet = loadBotWallet();
    const walletAddress = await wallet.getAddress();

    const settings = await db.bnbSettings.upsert({
        where: { userId },
        create: {
            userId,
            enabled: input.enabled,
            walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            slippageBps: input.slippageBps ?? 300,
            sweepEnabled: input.sweepEnabled,
            sweepMinBalanceBnb: input.sweepMinBalanceBnb,
        },
        update: {
            enabled: input.enabled,
            walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            slippageBps: input.slippageBps ?? 300,
            sweepEnabled: input.sweepEnabled,
            sweepMinBalanceBnb: input.sweepMinBalanceBnb,
        },
    });

    revalidatePath("/bnb");
    return settings;
}

export interface BnbFuelStatus {
    usdtBalance: number;
    buyAmountUsd: number;
    intervalHours: number;
    daysRemaining: number;
    projected: { label: string; usdt: number }[];
}

/**
 * "Fuel" = the bot wallet's real USDC balance, expressed in days of buys it
 * can still fund at the current buyAmountUsd/intervalHours settings — reads
 * live on-chain rather than any app-side bookkeeping. Mirrors
 * getSolanaFuelStatus. Projected series stops at 0 USDC or 20 cycles.
 */
export async function getBnbFuelStatus(): Promise<BnbFuelStatus | { error: string }> {
    const userId = await requireUserId();
    const settings = await db.bnbSettings.findUnique({ where: { userId } });
    if (!settings) return { error: "Configurează mai întâi setările botului." };
    try {
        const wallet = loadBotWallet();
        const usdtBalance = await getUsdtBalance(await wallet.getAddress());
        const buyAmountUsd = Number(settings.buyAmountUsd);
        const intervalHours = settings.intervalHours;
        const cyclesRemaining = buyAmountUsd > 0 ? Math.floor(usdtBalance / buyAmountUsd) : 0;
        const daysRemaining = cyclesRemaining * (intervalHours / 24);

        const projected: { label: string; usdt: number }[] = [];
        const maxCycles = Math.min(cyclesRemaining, 20);
        for (let i = 0; i <= maxCycles; i++) {
            const at = new Date(Date.now() + i * intervalHours * 60 * 60 * 1000);
            projected.push({
                label: at.toLocaleDateString("ro-RO", { day: "numeric", month: "short" }),
                usdt: Math.max(0, usdtBalance - i * buyAmountUsd),
            });
        }

        return { usdtBalance, buyAmountUsd, intervalHours, daysRemaining, projected };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function listBnbLots() {
    const userId = await requireUserId();
    return db.bnbLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } });
}

/** Manual "run now" — same code path as the cron, gated by the same interval check. */
export async function runBnbDcaNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runBnbDcaForUser(userId);
    revalidatePath("/bnb");
    revalidatePath("/bnb/stats");
    return result;
}

/** Manual "check orders now" — reconciles pending sell orders against 1inch on demand. */
export async function reconcileBnbOrdersNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await reconcileBnbOrdersForUser(userId);
    revalidatePath("/bnb");
    revalidatePath("/bnb/stats");
    return result;
}

/**
 * Destination address is display-only here — read straight from the env
 * var (never the database), so the settings page can confirm
 * "yes, BNB_SWEEP_DESTINATION is configured, and it looks like this"
 * without the page needing write access to where funds go.
 */
export async function getSweepDestinationInfo(): Promise<{ address: string } | { error: string }> {
    await requireUserId();
    const raw = process.env.BNB_SWEEP_DESTINATION;
    if (!raw) return { error: "BNB_SWEEP_DESTINATION nu este setat în Vercel." };
    return { address: raw.trim() };
}

/** Manual "Trimite acum" — same transfer logic as the monthly cron, but ignores the "already swept this month" gate. */
export async function runBnbSweepNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runBnbSweepForUser(userId, true);
    revalidatePath("/bnb");
    revalidatePath("/bnb/stats");
    return result;
}

export async function listBnbSweeps() {
    const userId = await requireUserId();
    return db.bnbSweep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export interface BnbStats {
    totalInvestedUsd: number;
    totalRealizedProceedsUsd: number;
    totalRealizedPnlUsd: number;
    totalFeesUsd: number;
    bnbHeld: number;
    openOrders: number;
    filledLots: number;
    totalLots: number;
}

export async function getBnbStats(): Promise<BnbStats> {
    const userId = await requireUserId();
    const lots = await db.bnbLot.findMany({ where: { userId } });

    let totalInvestedUsd = 0;
    let totalRealizedProceedsUsd = 0;
    let totalRealizedPnlUsd = 0;
    let totalFeesUsd = 0;
    let bnbHeld = 0;
    let openOrders = 0;
    let filledLots = 0;

    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        totalFeesUsd += Number(lot.buyFeeUsd);
        bnbHeld += Number(lot.bnbRemaining);
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
        bnbHeld,
        openOrders,
        filledLots,
        totalLots: lots.filter((l) => l.status !== "FAILED").length,
    };
}
