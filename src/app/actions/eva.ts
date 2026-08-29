"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { runEvaDcaForUser, reconcileEvaOrdersForUser } from "@/lib/solana/eva-dca";
import { runEvaSweepForUser } from "@/lib/solana/eva-sweep";
import { loadBotKeypair, getUsdcBalance } from "@/lib/solana/wallet";
import { MIN_TRIGGER_ORDER_USD } from "@/lib/solana/constants";
import { getSweepDestinationInfo as getSolanaSweepDestinationInfo } from "./solana";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface EvaSettingsInput {
    enabled: boolean;
    buyAmountUsd: number;
    intervalHours: number;
    takeProfitPercent: number;
    sellAmountUsd: number;
    slippageBps?: number;
    sweepEnabled: boolean;
    sweepMinBalanceEva: number;
}

export async function getEvaSettings() {
    const userId = await requireUserId();
    return db.evaSettings.findUnique({ where: { userId } });
}

/**
 * Same bot wallet as the SOL module — the address is derived from
 * SOLANA_PRIVATE_KEY (set in Vercel env vars), never entered by hand, so
 * there's no way for the stored address and the key that actually signs
 * transactions to drift apart. Returns an error string instead of throwing
 * so the settings page can show a clear "set the env var first" message.
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

export async function upsertEvaSettings(input: EvaSettingsInput) {
    await requireAdmin();
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_TRIGGER_ORDER_USD) {
        throw new Error(`Suma de vânzare trebuie să fie de cel puțin $${MIN_TRIGGER_ORDER_USD} (minim impus de Jupiter).`);
    }
    if (input.buyAmountUsd <= 0) throw new Error("Suma de cumpărare trebuie să fie pozitivă.");
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.takeProfitPercent <= 0) throw new Error("Procentul țintă trebuie să fie pozitiv.");
    if (input.sweepMinBalanceEva < 0) throw new Error("Minimul păstrat la retragere nu poate fi negativ.");

    // Derived from the env var, not user input — see getBotWalletAddress(). Same wallet as the SOL module.
    const keypair = loadBotKeypair();
    const walletAddress = keypair.publicKey.toBase58();

    const settings = await db.evaSettings.upsert({
        where: { userId },
        create: {
            userId,
            enabled: input.enabled,
            walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            // 500 bps (5%) default — EVA's on-chain liquidity is thin
            // (~$3k pool, "organicScore": "low" per Jupiter's token API),
            // so it needs much more slippage headroom than SOL's 0.5%
            // default. Still fully user-editable.
            slippageBps: input.slippageBps ?? 500,
            sweepEnabled: input.sweepEnabled,
            sweepMinBalanceEva: input.sweepMinBalanceEva,
        },
        update: {
            enabled: input.enabled,
            walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            slippageBps: input.slippageBps ?? 500,
            sweepEnabled: input.sweepEnabled,
            sweepMinBalanceEva: input.sweepMinBalanceEva,
        },
    });

    revalidatePath("/solana/eva");
    return settings;
}

export interface FuelStatus {
    usdcBalance: number;
    buyAmountUsd: number;
    intervalHours: number;
    daysRemaining: number;
    projected: { label: string; usdc: number }[];
}

/**
 * "Fuel" = the bot wallet's real USDC balance, expressed in days of buys it
 * can still fund at the current buyAmountUsd/intervalHours settings — reads
 * live on-chain rather than any app-side bookkeeping. USDC balance is
 * chain/token-agnostic (both SOL and EVA buys draw from the same USDC pot
 * in the same wallet), so this reuses the existing getUsdcBalance helper
 * unchanged rather than duplicating it.
 */
export async function getEvaFuelStatus(): Promise<FuelStatus | { error: string }> {
    const userId = await requireUserId();
    const settings = await db.evaSettings.findUnique({ where: { userId } });
    if (!settings) return { error: "Configurează mai întâi setările botului." };
    try {
        const keypair = loadBotKeypair();
        const usdcBalance = await getUsdcBalance(keypair.publicKey.toBase58());
        const buyAmountUsd = Number(settings.buyAmountUsd);
        const intervalHours = settings.intervalHours;
        const cyclesRemaining = buyAmountUsd > 0 ? Math.floor(usdcBalance / buyAmountUsd) : 0;
        const daysRemaining = cyclesRemaining * (intervalHours / 24);

        const projected: { label: string; usdc: number }[] = [];
        const maxCycles = Math.min(cyclesRemaining, 20);
        for (let i = 0; i <= maxCycles; i++) {
            const at = new Date(Date.now() + i * intervalHours * 60 * 60 * 1000);
            projected.push({
                label: at.toLocaleDateString("ro-RO", { day: "numeric", month: "short" }),
                usdc: Math.max(0, usdcBalance - i * buyAmountUsd),
            });
        }

        return { usdcBalance, buyAmountUsd, intervalHours, daysRemaining, projected };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function listEvaLots() {
    const userId = await requireUserId();
    return db.evaLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } });
}

/** Manual "run now" — same code path as the cron, gated by the same interval check. Useful to test the setup once, funded with a small amount. */
export async function runEvaDcaNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runEvaDcaForUser(userId);
    revalidatePath("/solana/eva");
    revalidatePath("/solana/eva/stats");
    return result;
}

/** Manual "check orders now" — reconciles pending sell orders against Jupiter on demand, without buying or waiting for the next scheduled cron pass. */
export async function reconcileEvaOrdersNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await reconcileEvaOrdersForUser(userId);
    revalidatePath("/solana/eva");
    revalidatePath("/solana/eva/stats");
    return result;
}

/**
 * Same SOLANA_SWEEP_DESTINATION env var as the SOL module (never a
 * separate one — the user explicitly wants one shared cold wallet for
 * both tokens), so this just re-exports the existing Solana action rather
 * than duplicating the env-var read.
 */
export async function getSweepDestinationInfo(): Promise<{ address: string } | { error: string }> {
    return getSolanaSweepDestinationInfo();
}

/** Manual "Trimite acum" — same transfer logic as the monthly cron, but ignores the "already swept this month" gate. Used to verify the setup once before relying on the automatic schedule. */
export async function runEvaSweepNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runEvaSweepForUser(userId, true);
    revalidatePath("/solana/eva");
    revalidatePath("/solana/eva/stats");
    return result;
}

export async function listEvaSweeps() {
    const userId = await requireUserId();
    return db.evaSweep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export interface EvaStats {
    totalInvestedUsd: number;
    totalRealizedProceedsUsd: number;
    totalRealizedPnlUsd: number;
    totalFeesUsd: number;
    evaHeld: number;
    openOrders: number;
    filledLots: number;
    totalLots: number;
}

export async function getEvaStats(): Promise<EvaStats> {
    const userId = await requireUserId();
    const lots = await db.evaLot.findMany({ where: { userId } });

    let totalInvestedUsd = 0;
    let totalRealizedProceedsUsd = 0;
    let totalRealizedPnlUsd = 0;
    let totalFeesUsd = 0;
    let evaHeld = 0;
    let openOrders = 0;
    let filledLots = 0;

    for (const lot of lots) {
        if (lot.status === "FAILED") continue;
        totalInvestedUsd += Number(lot.buyAmountUsd);
        totalFeesUsd += Number(lot.buyFeeUsd);
        evaHeld += Number(lot.evaRemaining);
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
        evaHeld,
        openOrders,
        filledLots,
        totalLots: lots.filter((l) => l.status !== "FAILED").length,
    };
}
