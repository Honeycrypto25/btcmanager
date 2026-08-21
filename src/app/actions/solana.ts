"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runSolanaDcaForUser } from "@/lib/solana/dca";
import { MIN_TRIGGER_ORDER_USD } from "@/lib/solana/constants";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface SolanaSettingsInput {
    enabled: boolean;
    walletAddress: string;
    buyAmountUsd: number;
    intervalHours: number;
    takeProfitPercent: number;
    sellAmountUsd: number;
    slippageBps?: number;
}

export async function getSolanaSettings() {
    const userId = await requireUserId();
    return db.solanaSettings.findUnique({ where: { userId } });
}

export async function upsertSolanaSettings(input: SolanaSettingsInput) {
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_TRIGGER_ORDER_USD) {
        throw new Error(`Suma de vânzare trebuie să fie de cel puțin $${MIN_TRIGGER_ORDER_USD} (minim impus de Jupiter).`);
    }
    if (input.buyAmountUsd <= 0) throw new Error("Suma de cumpărare trebuie să fie pozitivă.");
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.takeProfitPercent <= 0) throw new Error("Procentul țintă trebuie să fie pozitiv.");
    if (!input.walletAddress || input.walletAddress.length < 32) {
        throw new Error("Adresă de portofel Solana invalidă.");
    }

    const settings = await db.solanaSettings.upsert({
        where: { userId },
        create: {
            userId,
            enabled: input.enabled,
            walletAddress: input.walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            slippageBps: input.slippageBps ?? 50,
        },
        update: {
            enabled: input.enabled,
            walletAddress: input.walletAddress,
            buyAmountUsd: input.buyAmountUsd,
            intervalHours: input.intervalHours,
            takeProfitPercent: input.takeProfitPercent,
            sellAmountUsd: input.sellAmountUsd,
            slippageBps: input.slippageBps ?? 50,
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
    return result;
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
