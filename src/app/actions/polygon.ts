"use server";
import { pageCacheUserId } from "@/lib/page-cache";

import { getServerSession } from "next-auth";
import { revalidatePath } from "@/lib/page-cache"; // also expires the page cache
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { runPolygonReverseDcaForSettings, reconcilePolygonOrdersForSettings, executeBuybackNow } from "@/lib/polygon/reverse-dca";
import { runPolygonSweepForUser } from "@/lib/polygon/sweep";
import { loadBotWallet, getUsdcBalance, getNativeBalance, getTokenMeta, getTokenBalance } from "@/lib/polygon/wallet";
import { projectBuys } from "@/lib/solana/fuel-schedule";
import { getTokenPriceUsd, getNativePriceUsd } from "@/lib/polygon/oneinch";
import { ALLOWED_TOKENS, MIN_LIMIT_ORDER_USD, USDC_ADDRESS } from "@/lib/polygon/constants";
import type { PolygonTokenSettings } from "@prisma/client";

async function requireUserId(): Promise<string> {
    const cachedUser = pageCacheUserId(); // set while a page's data is being cached (no cookies there)
    if (cachedUser) return cachedUser;
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

export interface PolygonCurrentPrice {
    settingsId: string;
    tokenSymbol: string;
    priceUsd: number | null;
}

/**
 * Current live price per token bot, quoted via 1inch (getTokenPriceUsd) --
 * the "Preț curent" reference line shown on /polygon/stats' per-lot chart,
 * same as the Solana/Base/BNB/EVA stats pages already show for their own
 * single traded token. One price PER TOKEN here (not a single value) since
 * Polygon can run several token bots (GEOD, MYST, ...) at once, each at a
 * completely different price -- see PolygonDcaReportSummary in
 * dca-report-data.ts for the same reasoning applied to the email report.
 */
export async function getPolygonCurrentPrices(): Promise<PolygonCurrentPrice[]> {
    const userId = await requireUserId();
    const settingsRows = await db.polygonTokenSettings.findMany({ where: { userId } });
    return Promise.all(
        settingsRows.map(async (s: PolygonTokenSettings) => ({
            settingsId: s.id,
            tokenSymbol: s.tokenSymbol,
            priceUsd: await getTokenPriceUsd(s.tokenAddress, s.tokenDecimals, USDC_ADDRESS).catch(() => null),
        }))
    );
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
        revalidatePath("/polygon", "layout");
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
    slippageBps?: number;
}

export async function updatePolygonTokenSettings(settingsId: string, input: PolygonTokenSettingsInput) {
    await requireAdmin();
    const userId = await requireUserId();

    if (input.sellAmountUsd < MIN_LIMIT_ORDER_USD) {
        throw new Error(`Suma vândută pe ciclu trebuie să fie de cel puțin $${MIN_LIMIT_ORDER_USD}.`);
    }
    if (input.intervalHours < 1) throw new Error("Intervalul trebuie să fie de cel puțin 1 oră.");
    if (input.buybackDipPercent <= 0 || input.buybackDipPercent >= 100) {
        throw new Error("Procentul de scădere pentru răscumpărare trebuie să fie între 0 și 100.");
    }
    // The buy-back order always re-funds the exact token quantity sold, at
    // the dipped target price — that costs sellAmountUsd * (1 - dip%), which
    // must clear 1inch's minimum order size.
    const buybackOrderUsd = input.sellAmountUsd * (1 - input.buybackDipPercent / 100);
    if (buybackOrderUsd < MIN_LIMIT_ORDER_USD) {
        throw new Error(
            `Cu o scădere de ${input.buybackDipPercent}%, comanda de răscumpărare ar costa doar $${buybackOrderUsd.toFixed(2)} — sub minimul de $${MIN_LIMIT_ORDER_USD}. Crește suma vândută sau scade procentul de scădere.`
        );
    }

    const settings = await db.polygonTokenSettings.update({
        where: { id: settingsId, userId },
        data: {
            enabled: input.enabled,
            sellAmountUsd: input.sellAmountUsd,
            intervalHours: input.intervalHours,
            buybackDipPercent: input.buybackDipPercent,
            slippageBps: input.slippageBps ?? 300,
        },
    });

    revalidatePath("/polygon", "layout");
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
    revalidatePath("/polygon", "layout");
    return result;
}

/** Manual "sell now": skips the interval check. Does not move the regular schedule. */
export async function runPolygonDcaForceNow(settingsId: string) {
    await requireAdmin();
    const result = await runPolygonReverseDcaForSettings(settingsId, { force: true });
    revalidatePath("/polygon", "layout");
    return result;
}

export async function reconcilePolygonOrdersNow(settingsId: string) {
    await requireAdmin();
    const result = await reconcilePolygonOrdersForSettings(settingsId);
    revalidatePath("/polygon", "layout");
    return result;
}

export interface PolygonBuybackNowResult {
    ok: boolean;
    message: string;
}

/** "Cumpără acum" for one lot whose buy-back order has been open a long time without a resolver filling it — cancels it and buys at market instead. */
export async function buyBackPolygonLotNowAction(lotId: string): Promise<PolygonBuybackNowResult> {
    await requireAdmin();
    const userId = await requireUserId();
    try {
        const r = await executeBuybackNow(userId, lotId);
        return { ok: true, message: `Cumpărat ${r.tokenReacquired.toFixed(4)} la piață, $${r.usdcSpent.toFixed(2)}.` };
    } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
    } finally {
        revalidatePath("/polygon", "layout");
    }
}

export interface PolygonCheckAllResult {
    checked: number;
    filled: number;
    cancelled: number;
    /** Open buy-back orders whose target is at/above the live price but which 1inch has not filled. */
    warnings: string[];
}

/** "Verifică acum" on the stats page: reconciles every token's open buy-back orders, then flags open orders whose target the price has already reached. */
export async function checkAllPolygonOrdersNow(): Promise<PolygonCheckAllResult> {
    await requireAdmin();
    const userId = await requireUserId();
    const settings = await db.polygonTokenSettings.findMany({ where: { userId } });
    const total: PolygonCheckAllResult = { checked: 0, filled: 0, cancelled: 0, warnings: [] };
    for (const s of settings) {
        const r = await reconcilePolygonOrdersForSettings(s.id);
        total.checked += r.checked;
        total.filled += r.filled;
        total.cancelled += r.cancelled;
    }
    const [prices, open] = await Promise.all([
        getPolygonCurrentPrices().catch(() => [] as PolygonCurrentPrice[]),
        db.polygonTokenLot.findMany({ where: { userId, status: "OPEN" }, orderBy: { soldAt: "asc" } }),
    ]);
    const priceById = new Map(prices.map((p) => [p.settingsId, p.priceUsd]));
    const symbolById = new Map(settings.map((s) => [s.id, s.tokenSymbol]));
    for (const lot of open) {
        const price = priceById.get(lot.settingsId);
        if (price == null || !lot.targetPriceUsd) continue;
        if (price <= Number(lot.targetPriceUsd)) {
            total.warnings.push(
                `${symbolById.get(lot.settingsId) ?? "?"} ${lot.soldAt.toISOString().slice(0, 10)}: prețul $${price} e sub ținta $${Number(lot.targetPriceUsd)} dar ordinul e încă activ în 1inch.`
            );
        }
    }
    revalidatePath("/polygon", "layout");
    return total;
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
    revalidatePath("/polygon", "layout");
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
    revalidatePath("/polygon", "layout");
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


export interface PolygonTokenFuel {
    settingsId: string;
    tokenSymbol: string;
    tokenBalance: number; // tokens sitting in the bot wallet right now
    priceUsd: number;
    tokensPerCycle: number; // floor(sellAmountUsd / price) — what one cycle sells
    sellAmountUsd: number;
    intervalHours: number;
    periodHours: number;
    cyclesLeft: number;
    daysRemaining: number;
    projected: { label: string; usdc: number }[]; // "usdc" = token amount (shared FuelBars shape)
}

/**
 * Reverse-DCA "fuel" = the token stock the wallet holds (each cycle sells a whole-token amount of it; the stock comes
 * back when the buy-back order fills, and new tokens arrive from mining). Per token, plus the wallet's POL gas float.
 * Gas is wallet-level — the page strips it for non-admin viewers.
 */
export async function getPolygonFuelStatus(): Promise<{ tokens: PolygonTokenFuel[]; gas: { nativeBalance: number; nativePriceUsd: number } | { error: string } }> {
    const userId = await requireUserId();
    const settingsRows = await db.polygonTokenSettings.findMany({ where: { userId } });
    const now = Date.now();
    const fmt = (t: number) => new Date(t).toLocaleDateString("ro-RO", { day: "numeric", month: "short", timeZone: "Europe/London" });
    const tokens = (
        await Promise.all(
            settingsRows.map(async (s: PolygonTokenSettings): Promise<PolygonTokenFuel | null> => {
                try {
                    const [tokenBalance, priceUsd] = await Promise.all([
                        getTokenBalance(s.tokenAddress, s.tokenDecimals, s.walletAddress),
                        getTokenPriceUsd(s.tokenAddress, s.tokenDecimals, USDC_ADDRESS),
                    ]);
                    const sellAmountUsd = Number(s.sellAmountUsd);
                    const tokensPerCycle = Math.max(0, Math.floor(sellAmountUsd / priceUsd));
                    const plan = projectBuys({ lastRunAt: s.lastRunAt ? s.lastRunAt.getTime() : null, intervalHours: s.intervalHours, balance: tokenBalance, buyAmount: tokensPerCycle, now });
                    const projected: { label: string; usdc: number }[] = [{ label: "Acum", usdc: tokenBalance }];
                    plan.buyTimes.forEach((t, i) => projected.push({ label: fmt(t), usdc: Math.max(0, tokenBalance - (i + 1) * tokensPerCycle) }));
                    const cyclesLeft = tokensPerCycle > 0 ? Math.floor(tokenBalance / tokensPerCycle + 1e-9) : 0;
                    return { settingsId: s.id, tokenSymbol: s.tokenSymbol, tokenBalance, priceUsd, tokensPerCycle, sellAmountUsd, intervalHours: s.intervalHours, periodHours: plan.periodDays * 24, cyclesLeft, daysRemaining: plan.daysRemaining, projected };
                } catch {
                    return null;
                }
            }),
        )
    ).filter((t): t is PolygonTokenFuel => t !== null);
    try {
        const nativeBalance = await getNativeBalance(await loadBotWallet().getAddress());
        const nativePriceUsd = await getNativePriceUsd(USDC_ADDRESS).catch(() => 0);
        return { tokens, gas: { nativeBalance, nativePriceUsd } };
    } catch (e) {
        return { tokens, gas: { error: e instanceof Error ? e.message : String(e) } };
    }
}
