"use server";
import { pageCacheUserId } from "@/lib/page-cache";

import { getServerSession } from "next-auth";
import { revalidatePath } from "@/lib/page-cache"; // also expires the page cache
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { runSolanaDcaForUser, reconcileSolanaOrdersForUser } from "@/lib/solana/dca";
import { createSolanaLimitBuy, cancelSolanaLimitBuy, syncAutoDipOrder } from "@/lib/solana/limit-buy";
import { runSolanaSweepForUser } from "@/lib/solana/sweep";
import { listSweepLendPositions, type SweepLendPosition } from "@/lib/solana/lend-deposit";
import { loadBotKeypair, getUsdcBalance } from "@/lib/solana/wallet";
import { projectBuys } from "@/lib/solana/fuel-schedule";
import { MIN_TRIGGER_ORDER_USD } from "@/lib/solana/constants";

async function requireUserId(): Promise<string> {
    const cachedUser = pageCacheUserId(); // set while a page's data is being cached (no cookies there)
    if (cachedUser) return cachedUser;
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
    /** "cold" (default) = SOL to the cold wallet; "lend" = deposit into a Jupiter Lend position owned by that wallet. */
    sweepTarget?: "cold" | "lend";
    sweepLendPosition?: { vaultId: number; id: number } | null;
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
        const keypair = await loadBotKeypair();
        return { address: keypair.publicKey.toBase58() };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function upsertSolanaSettings(input: SolanaSettingsInput) {
    await requireAdmin();
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_TRIGGER_ORDER_USD) {
        throw new Error(`Suma de vânzare trebuie să fie de cel puțin $${MIN_TRIGGER_ORDER_USD} (minim impus de Jupiter).`);
    }
    if (input.buyAmountUsd <= 0) throw new Error("Suma de cumpărare trebuie să fie pozitivă.");
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.takeProfitPercent <= 0) throw new Error("Procentul țintă trebuie să fie pozitiv.");
    if (input.sweepMinBalanceSol < 0) throw new Error("Minimul păstrat la retragere nu poate fi negativ.");

    const sweepTarget = input.sweepTarget === "lend" ? "lend" : "cold";
    let lendVaultId: number | null = null;
    let lendPositionId: number | null = null;
    if (sweepTarget === "lend") {
        const pos = input.sweepLendPosition;
        if (!pos) throw new Error("Alege poziția de împrumut în care se depune SOL-ul lunar.");
        const owner = process.env.SOLANA_SWEEP_DESTINATION?.trim();
        if (!owner) throw new Error("SOLANA_SWEEP_DESTINATION nu este setat în Vercel — poziția de împrumut aparține acelui wallet.");
        const { positions, error } = await listSweepLendPositions(owner);
        if (error) throw new Error(`Nu pot verifica pozițiile de împrumut: ${error}`);
        if (!positions.some((p) => p.id === pos.id && p.vaultId === pos.vaultId)) {
            throw new Error("Poziția aleasă nu aparține walletului de destinație sau nu are SOL drept colateral.");
        }
        lendVaultId = pos.vaultId;
        lendPositionId = pos.id;
    }

    // Derived from the env var, not user input — see getBotWalletAddress().
    const keypair = await loadBotKeypair();
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
            sweepTarget,
            sweepLendVaultId: lendVaultId,
            sweepLendPositionId: lendPositionId,
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
            sweepTarget,
            // Keeps the last chosen position when switching back to the cold wallet; cleared only by choosing another.
            ...(sweepTarget === "lend" ? { sweepLendVaultId: lendVaultId, sweepLendPositionId: lendPositionId } : {}),
            // Switching away from "lend" (or turning the sweep off) drops a pending retry.
            ...(sweepTarget !== "lend" || !input.sweepEnabled ? { sweepRetryPending: false } : {}),
        },
    });

    revalidatePath("/solana");
    return settings;
}

export interface FuelStatus {
    usdcBalance: number;
    buyAmountUsd: number;
    intervalHours: number;
    daysRemaining: number;
    /** Hours between real buys: the daily 09:00 UTC cron means whole days (a 23h interval buys every 24h). */
    periodHours: number;
    /** Buys the balance can still fund (all of them, even if the chart shows fewer). */
    buysLeft: number;
    /** First bar is "Acum" (balance right now), then the balance after each scheduled buy. */
    projected: { label: string; usdc: number }[];
}

/**
 * "Fuel" = the bot wallet's real USDC balance, expressed in days of buys it
 * can still fund at the current buyAmountUsd/intervalHours settings — reads
 * live on-chain rather than any app-side bookkeeping, same principle as the
 * sweep balance check. Projected series stops at 0 USDC or 20 cycles,
 * whichever comes first, just to keep the chart a sane size.
 */
export async function getSolanaFuelStatus(): Promise<FuelStatus | { error: string }> {
    const userId = await requireUserId();
    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings) return { error: "Configurează mai întâi setările botului." };
    try {
        const keypair = await loadBotKeypair();
        const usdcBalance = await getUsdcBalance(keypair.publicKey.toBase58());
        const buyAmountUsd = Number(settings.buyAmountUsd);
        const intervalHours = settings.intervalHours;
        const plan = projectBuys({ lastRunAt: settings.lastRunAt ? settings.lastRunAt.getTime() : null, intervalHours, balance: usdcBalance, buyAmount: buyAmountUsd, now: Date.now() });
        const buysLeft = buyAmountUsd > 0 ? Math.floor(usdcBalance / buyAmountUsd + 1e-9) : 0;
        const daysRemaining = plan.daysRemaining;
        const fmt = (t: number) => new Date(t).toLocaleDateString("ro-RO", { day: "numeric", month: "short", timeZone: "Europe/London" }) + " " + new Date(t).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
        const projected: { label: string; usdc: number }[] = [{ label: "Acum", usdc: usdcBalance }];
        plan.buyTimes.forEach((t, i) => projected.push({ label: fmt(t), usdc: Math.max(0, usdcBalance - (i + 1) * buyAmountUsd) }));

        return { usdcBalance, buyAmountUsd, intervalHours, daysRemaining, periodHours: plan.periodDays * 24, buysLeft, projected };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export async function listSolanaLots() {
    const userId = await requireUserId();
    return db.solanaLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } });
}

/** Manual "run now" — same code path as the cron, gated by the same interval check. Useful to test the setup once, funded with a small amount. */
export async function runSolanaDcaNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runSolanaDcaForUser(userId);
    revalidatePath("/solana");
    revalidatePath("/solana/stats");
    return result;
}

/** Manual "buy now": skips the interval check (e.g. the price dipped and you want an extra buy). Does not move the regular schedule. */
export async function runSolanaDcaForceNow() {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runSolanaDcaForUser(userId, { force: true });
    revalidatePath("/solana");
    revalidatePath("/solana/stats");
    return result;
}

/** Manual "check orders now" — reconciles pending sell orders against Jupiter on demand, without buying or waiting for the next scheduled cron pass. */
export async function reconcileSolanaOrdersNow() {
    await requireAdmin();
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

/**
 * Manual "Trimite acum" — same logic as the monthly cron, but ignores the "already swept this month" gate. Used to
 * verify the setup once before relying on the automatic schedule. For the "lend" target it can also just simulate
 * the deposit (dryRun: nothing is sent or saved) and/or use a small test amount.
 */
export async function runSolanaSweepNow(opts: { amountSol?: number; dryRun?: boolean } = {}) {
    await requireAdmin();
    const userId = await requireUserId();
    const result = await runSolanaSweepForUser(userId, true, { amountSol: opts.amountSol, dryRun: opts.dryRun });
    if (!opts.dryRun) {
        revalidatePath("/solana");
        revalidatePath("/solana/stats");
    }
    return result;
}

/** The open SOL-collateral Jupiter Lend positions of the cold wallet — what a "lend" sweep can be deposited into. */
export async function getSweepLendOptions(): Promise<{ positions: SweepLendPosition[]; error: string | null }> {
    await requireUserId();
    const owner = process.env.SOLANA_SWEEP_DESTINATION?.trim();
    if (!owner) return { positions: [], error: "SOLANA_SWEEP_DESTINATION nu este setat în Vercel." };
    return listSweepLendPositions(owner);
}

/**
 * Called when the Solana page is opened: if the last "lend" sweep failed, tries it again (at most once every
 * 6 hours; the claim below is atomic, so two open tabs can never send it twice). Admin-only, quiet otherwise.
 */
export async function retryPendingSolanaSweep(): Promise<{ action: "none" | "sent" | "error"; message?: string }> {
    try {
        await requireAdmin();
    } catch {
        return { action: "none" };
    }
    const userId = await requireUserId();
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const claimed = await db.solanaSettings.updateMany({
        where: { userId, sweepEnabled: true, sweepTarget: "lend", sweepRetryPending: true, OR: [{ lastSweepAt: null }, { lastSweepAt: { lt: sixHoursAgo } }] },
        data: { lastSweepAt: new Date() },
    });
    if (claimed.count === 0) return { action: "none" };

    const result = await runSolanaSweepForUser(userId, false, { retry: true });
    revalidatePath("/solana");
    revalidatePath("/solana/stats");
    if (result.action === "sent") return { action: "sent", message: `Retragerea eșuată anterior a fost depusă acum în împrumut: ${result.amountSol} SOL.` };
    if (result.action === "error") return { action: "error", message: result.reason };
    return { action: "none" };
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


/**
 * Places a resting limit order that BUYS SOL with USDC at a lower price. Jupiter
 * escrows the USDC until the order fills or is cancelled; a fill becomes a lot and
 * the usual take-profit sell order is placed at the next check.
 */
export async function createSolanaLimitBuyNow(input: { amountUsd: number; limitPriceUsd: number }) {
    await requireAdmin();
    const userId = await requireUserId();
    const order = await createSolanaLimitBuy(userId, input);
    revalidatePath("/solana");
    return { id: order.id };
}

/** Cancels one open limit buy (small network fee); the escrowed USDC returns to the wallet. */
export async function cancelSolanaLimitBuyNow(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    await cancelSolanaLimitBuy(userId, id);
    revalidatePath("/solana");
}

export interface AutoDipInput {
    enabled: boolean;
    percent: number;
    amountUsd: number;
    minMovePercent: number;
}

/**
 * Saves the auto "dip" settings. Turning it on places the order right away (so the
 * outcome is visible); turning it off cancels the open auto order and frees its USDC.
 */
export async function saveSolanaAutoDip(input: AutoDipInput): Promise<{ note: string }> {
    await requireAdmin();
    const userId = await requireUserId();
    if (!(input.percent > 0 && input.percent < 90)) throw new Error("Procentul trebuie să fie între 0 și 90.");
    if (input.amountUsd < MIN_TRIGGER_ORDER_USD) throw new Error(`Suma trebuie să fie de cel puțin $${MIN_TRIGGER_ORDER_USD} (minim impus de Jupiter).`);
    if (!(input.minMovePercent >= 0 && input.minMovePercent < 50)) throw new Error("Mișcarea minimă trebuie să fie între 0 și 50%.");
    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings) throw new Error("Salvează întâi setările botului.");

    await db.solanaSettings.update({
        where: { userId },
        data: { autoDipEnabled: input.enabled, autoDipPercent: input.percent, autoDipAmountUsd: input.amountUsd, autoDipMinMovePercent: input.minMovePercent },
    });

    let note: string;
    if (input.enabled) {
        note = await syncAutoDipOrder(userId);
    } else {
        const open = await db.solanaBuyOrder.findMany({ where: { userId, status: "OPEN", auto: true } });
        for (const o of open) await cancelSolanaLimitBuy(userId, o.id, "Anulat: automatizarea a fost oprită.");
        note = open.length ? `Oprit. ${open.length} ordin anulat, USDC-ul revine în portofel.` : "Oprit.";
        await db.solanaSettings.update({ where: { userId }, data: { autoDipLastAt: new Date(), autoDipLastNote: note } });
    }
    revalidatePath("/solana");
    return { note };
}
