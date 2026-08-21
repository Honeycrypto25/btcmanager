"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runSolanaDcaForUser, reconcileSolanaOrdersForUser } from "@/lib/solana/dca";
import { runSolanaSweepForUser } from "@/lib/solana/sweep";
import { loadBotKeypair } from "@/lib/solana/wallet";
import { MIN_TRIGGER_ORDER_USD } from "@/lib/solana/constants";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface SolanaSettingsInput {
    enabled: boolean;
    buyAmountUsd: number;
    intervalHours: number;
    takeProfitPercent: number;
    sellAmountUsd: number;
    slippageBps?: number;
    sweepEnabled: boolean;
    sweepMinBalanceSol: number;
}

export async function getSolanaSettings() {
    const userId = await requireUserId();
    return db.solanaSettings.findUnique({ where: { userId } });
}

/**
 * The wallet address is never entered by hand — it's derived from
 * SOLANA_PRIVATE_KEY (set in Vercel env vars) so there's no way for the
 * stored address and the key that actually signs transactions to drift
 * apart. Returns an error string instead of throwing so the settings page
 * can show a clear "set the env var first" message.
 */
export async function getBotWalletAddress(): Promise<{ address: string } | { error: string }> {
    await requireUserId();
    try {
        const keypair = loadBotKeypair();
        return { address: keypair.publicKey.toBase58() };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function upsertSolanaSettings(input: SolanaSettingsInput) {
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_TRIGGER_ORDER_USD) {
        throw new Error(`Suma de vânzare trebuie să fie de cel puțin $${MIN_TRIGGER_ORDER_USD} (minim impus de Jupiter).`);
    }
    if (input.buyAmountUsd <= 0) throw new Error("Suma de cumpărare trebuie să fie pozitivă.");
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.takeProfitPercent <= 0) throw new Error("Procentul țintă trebuie să fie pozitiv.");
    if (input.sweepMinBalanceSol < 0) throw new Error("Minimul păstrat la retragere nu poate fi negativ.");

    // Derived from the env var, not user input — see getBotWalletAddress().
    const keypair = loadBotKeypair();
    const walletAddress = keypair.publicKey.toBase58();

    const settings = await db.solanaSettings.upsert({
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
            sweepMinBalanceSol: input.sweepMinBalanceSol,
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
            sweepMinBalanceSol: input.sweepMinBalanceSol,
        },
    });

    revalidatePath("/solana");
    return settings;
}

export async function listSolanaLots() {
    const userId = await requireUserId();
    return db.solanaLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } });
}

/** Manual "run now" — same code path as the cron, gated by the same interval check. Useful to test the setup once, funded with a small amount. */
export async function runSolanaDcaNow() {
    const userId = await requireUserId();
    const result = await runSolanaDcaForUser(userId);
    revalidatePath("/solana");
    revalidatePath("/solana/stats");
    return result;
}

/** Manual "check orders now" — reconciles pending sell orders against Jupiter on demand, without buying or waiting for the next scheduled cron pass. */
export async function reconcileSolanaOrdersNow() {
    const userId = await requireUserId();
    const result = await reconcileSolanaOrdersForUser(userId);
    revalidatePath("/solana");
    revalidatePath("/solana/stats");
    return result;
}

/**
 * Destination address is display-only here — read straight from the env
 * var (never the database), truncated so the settings page can confirm
 * "yes, SOLANA_SWEEP_DESTINATION is configured, and it looks like this"
 * without the page needing write access to where funds go.
 */
export async function getSweepDestinationInfo(): Promise<{ address: string } | { error: string }> {
    await requireUserId();
    const raw = process.env.SOLANA_SWEEP_DESTINATION;
    if (!raw) return { error: "SOLANA_SWEEP_DESTINATION nu este setat în Vercel." };
    return { address: raw.trim() };
}

/** Manual "Trimite acum" — same transfer logic as the monthly cron, but ignores the "already swept this month" gate. Used to verify the setup once before relying on the automatic schedule. */
export async function runSolanaSweepNow() {
    const userId = await requireUserId();
    const result = await runSolanaSweepForUser(userId, true);
    revalidatePath("/solana");
    revalidatePath("/solana/stats");
    return result;
}

export async function listSolanaSweeps() {
    const userId = await requireUserId();
    return db.solanaSweep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export interface SolanaStats {
    totalInvestedUsd: number;
    totalRealizedProceedsUsd: number;
    totalRealizedPnlUsd: number;
    totalFeesUsd: number;
    solHeld: number;
    openOrders: number;
    filledLots: number;
    totalLots: number;
}

export async function getSolanaStats(): Promise<SolanaStats> {
    const userId = await requireUserId();
    const lots = await db.solanaLot.findMany({ where: { userId } });

    let totalInvestedUsd = 0;
    let totalRealizedProceedsUsd = 0;
    let totalRealizedPnlUsd = 0;
    let totalFeesUsd = 0;
    let solHeld = 0;
    let openOrders = 0;
    let filledLots = 0;

    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        totalFeesUsd += Number(lot.buyFeeUsd);
        solHeld += Number(lot.solRemaining);
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
        solHeld,
        openOrders,
        filledLots,
        totalLots: lots.filter((l) => l.status !== "FAILED").length,
    };
}
