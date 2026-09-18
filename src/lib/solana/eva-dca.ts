import "server-only";
import type { Keypair } from "@solana/web3.js";
import { db } from "@/lib/db";
import { getSplTokenBalance, loadBotKeypair } from "./wallet";
import { runEvaSweepForUser } from "./eva-sweep";
import {
    cancelTriggerV1Order,
    createTriggerSellOrder,
    createTriggerV2SellOrder,
    ensureTriggerV2Vault,
    executeUltraOrder,
    getTriggerV2Orders,
    getTriggerV2Token,
    getActiveTriggerOrders,
    getHistoricalTriggerOrder,
    getTokenPriceUsd,
    getUltraOrder,
} from "./jupiter";
import {
    EVA_DECIMALS,
    EVA_MINT,
    EVA_V2_SELL_SLIPPAGE_BPS,
    MIN_TRIGGER_ORDER_USD,
    MIN_TRIGGER_V2_ORDER_USD,
    MIN_TRIGGER_V2_TARGET_USD,
    SOL_DECIMALS,
    SOL_MINT,
    TRIGGER_V2_ORDER_TTL_DAYS,
    USDC_DECIMALS,
    USDC_MINT,
} from "./constants";
import { notifyOrderPlaced, notifyOrderFilled } from "@/lib/email/tx-notify";

function toRawAmount(amount: number, decimals: number): string {
    return Math.round(amount * 10 ** decimals).toString();
}

function fromRawAmount(raw: string, decimals: number): number {
    return Number(raw) / 10 ** decimals;
}

/** Jupiter's V2 payloads mix decimal strings ("3.36") and raw atomic strings ("3360000000"); normalise either to a decimal number. */
function parseAmount(value: string | number | undefined | null, decimals: number): number | null {
    if (value === undefined || value === null || value === "") return null;
    const str = String(value);
    const n = Number(str);
    if (!Number.isFinite(n)) return null;
    return str.includes(".") ? n : n / 10 ** decimals;
}

/**
 * Places the EVA take-profit sell order on Trigger V1 or V2. V2 is used when
 * `forceV2` is set (e.g. a lot being migrated) or EVA_TRIGGER_VERSION=2.
 * V2 triggers on Jupiter's USD price >= target and needs the deposit worth
 * at least ~$10 at the CURRENT price, which is checked here BEFORE any
 * on-chain step so a too-small lot fails cleanly instead of half-way.
 */
async function placeSellOrder(params: {
    keypair: Keypair;
    evaAmount: number;
    targetPriceUsd: number;
    proceedsUsd: number; // USDC the V1 order asks for (= evaAmount * targetPriceUsd)
    forceV2?: boolean;
    v2Token?: string; // reuse an already-obtained JWT
}): Promise<{ orderKey: string; txSignature: string; version: 1 | 2 }> {
    const useV2 = params.forceV2 === true || process.env.EVA_TRIGGER_VERSION === "2";
    if (!useV2) {
        const { orderKey, txSignature } = await createTriggerSellOrder({
            keypair: params.keypair,
            inputMint: EVA_MINT,
            outputMint: USDC_MINT,
            makingAmountRaw: toRawAmount(params.evaAmount, EVA_DECIMALS),
            takingAmountRaw: toRawAmount(params.proceedsUsd, USDC_DECIMALS),
        });
        return { orderKey, txSignature, version: 1 };
    }

    const price = await getTokenPriceUsd(EVA_MINT);
    const valueNowUsd = params.evaAmount * price;
    if (valueNowUsd < MIN_TRIGGER_V2_ORDER_USD) {
        throw new Error(
            `Trigger V2 cere un depozit de cel puțin $${MIN_TRIGGER_V2_ORDER_USD} la prețul curent; ${params.evaAmount.toFixed(4)} EVA valorează acum $${valueNowUsd.toFixed(2)}.`
        );
    }
    const token = params.v2Token ?? (await getTriggerV2Token(params.keypair));
    await ensureTriggerV2Vault(token);
    const { orderId, txSignature } = await createTriggerV2SellOrder({
        keypair: params.keypair,
        token,
        inputMint: EVA_MINT,
        outputMint: USDC_MINT,
        inputAmountRaw: toRawAmount(params.evaAmount, EVA_DECIMALS),
        triggerMint: EVA_MINT,
        triggerPriceUsd: params.targetPriceUsd,
        slippageBps: EVA_V2_SELL_SLIPPAGE_BPS,
        expiresAtMs: Date.now() + TRIGGER_V2_ORDER_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
    return { orderKey: orderId, txSignature, version: 2 };
}

export interface DcaRunResult {
    userId: string;
    action: "skipped" | "bought" | "error";
    reason?: string;
    lotId?: string;
}

/**
 * Reconciles ALL of this user's OPEN lots against Jupiter's Trigger API in
 * one batched pass: a single (paginated) call fetches every currently-
 * active order for the wallet, so lots still genuinely open cost nothing
 * beyond that one fetch. Only lots whose order has DROPPED OUT of the
 * active list (i.e. actually filled or got cancelled) get an individual,
 * targeted history lookup for their fill details — that's normally 0-1
 * lots per run, not the full set. Every OPEN lot gets `lastCheckedAt`
 * stamped regardless, so the UI can show "still being watched" even when
 * nothing changed. Runs once per cycle, right before deciding whether a
 * new buy is due. Mirrors dca.ts's reconcileOpenLots, operating on
 * db.evaLot / EVA_MINT instead of SOL.
 */
interface ReconcileResult {
    checked: number;
    filled: number;
    cancelled: number;
}

/** Reconciles OPEN lots whose sell order lives on Trigger V2 (matched by order UUID in V2's order history). */
async function reconcileV2Lots(lots: Awaited<ReturnType<typeof db.evaLot.findMany>>, result: ReconcileResult): Promise<void> {
    const keypair = loadBotKeypair();
    const token = await getTriggerV2Token(keypair);
    const [active, past] = await Promise.all([getTriggerV2Orders(token, "active"), getTriggerV2Orders(token, "past")]);
    const byId = new Map([...past, ...active].map((o) => [o.id, o]));
    const now = new Date();

    for (const lot of lots) {
        const order = lot.jupiterOrderKey ? byId.get(lot.jupiterOrderKey) : undefined;
        if (!order) {
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        if (order.orderState === "filled") {
            const fill = order.events?.find((e) => e.type === "fill");
            const evaSold = parseAmount(order.inputUsed, EVA_DECIMALS) ?? Number(lot.sellAmountEvaPlanned ?? 0);
            const proceedsUsd = parseAmount(order.outputAmount ?? fill?.outputAmount, USDC_DECIMALS);
            if (proceedsUsd === null || evaSold <= 0) {
                await db.evaLot.update({
                    where: { id: lot.id },
                    data: { lastCheckedAt: now, notes: "V2: ordin umplut, dar Jupiter n-a întors sumele — verifică manual în istoric." },
                });
                continue;
            }
            const feeUsd = 0; // V2 history exposes no separate fee; proceeds are the net output.
            const costBasisUsd = Number(lot.buyPriceUsd) * evaSold;
            const evaAcquiredNum = Number(lot.evaAcquired);
            const buyFeeShare = evaAcquiredNum > 0 ? Number(lot.buyFeeUsd) * (evaSold / evaAcquiredNum) : 0;
            const realizedPnlUsd = proceedsUsd - feeUsd - costBasisUsd - buyFeeShare;
            const soldAtMs = fill?.timestamp ?? order.triggeredAt ?? now.getTime();

            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "FILLED",
                    soldAt: new Date(soldAtMs),
                    evaSold,
                    sellProceedsUsd: proceedsUsd,
                    sellFeeUsd: feeUsd,
                    sellTxSignature: fill?.txSignature,
                    realizedPnlUsd,
                    evaRemaining: Number(lot.evaAcquired) - evaSold,
                    lastCheckedAt: now,
                },
            });
            result.filled++;
            await notifyOrderFilled({
                chain: "Solana",
                tokenSymbol: "Eva",
                tokenSold: evaSold,
                sellProceedsUsd: proceedsUsd,
                realizedPnlUsd,
                sellFeeUsd: feeUsd,
                sellTxUrl: fill?.txSignature ? `https://solscan.io/tx/${fill.txSignature}` : undefined,
            });
        } else if (["cancelled", "expired", "failed"].includes(order.orderState)) {
            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "CANCELLED",
                    evaRemaining: lot.evaAcquired,
                    lastCheckedAt: now,
                    notes: `V2: ordinul e „${order.orderState}". ${order.orderState === "cancelled" ? "" : "EVA poate rămâne în vault-ul Jupiter până la retragere (anulare + confirm)."}`.trim(),
                },
            });
            result.cancelled++;
        } else {
            // pending / open / executing / pending_withdraw — still in motion. Surface anything
            // other than plain "open" so a stuck/odd order is visible in the dashboard.
            const stateNote =
                order.orderState === "open" ? null : `V2 stare: ${order.orderState}${order.rawState ? ` (${order.rawState})` : ""}`;
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now, ...(stateNote ? { notes: stateNote } : {}) } });
        }
    }
}

async function reconcileOpenLots(userId: string, walletAddress: string): Promise<ReconcileResult> {
    const allOpen = await db.evaLot.findMany({ where: { userId, status: "OPEN" } });
    const openLots = allOpen.filter((l) => l.triggerVersion !== 2);
    const v2Lots = allOpen.filter((l) => l.triggerVersion === 2);
    const result: ReconcileResult = { checked: allOpen.length, filled: 0, cancelled: 0 };

    // A V2 (auth/API) hiccup must never block the daily buy or the V1 pass below.
    if (v2Lots.length > 0) {
        try {
            await reconcileV2Lots(v2Lots, result);
        } catch (err) {
            console.error("Eva V2 reconcile failed", err);
        }
    }
    if (openLots.length === 0) return result;

    const activeOrders = await getActiveTriggerOrders(walletAddress);
    const now = new Date();

    for (const lot of openLots) {
        if (!lot.jupiterOrderKey) continue;

        if (activeOrders.has(lot.jupiterOrderKey)) {
            // Still open on Jupiter's side — nothing to update except the checked timestamp.
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        // No longer active — it must have filled or been cancelled. Only now
        // is an individual (more expensive) history lookup worth doing.
        const order = await getHistoricalTriggerOrder(walletAddress, lot.jupiterOrderKey);
        if (!order) {
            // Not found anywhere yet (e.g. propagation delay right after creation) — just mark checked, try again next run.
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
            continue;
        }

        if (order.status === "Completed") {
            const fill = order.trades[0];
            // NB: fill.inputAmount/outputAmount (and order.makingAmount/takingAmount)
            // are already decimal-adjusted despite reading like raw amounts — the
            // *actual* raw atomic-unit fields are raw{Input,Output}Amount /
            // raw{Making,Taking}Amount. Must use those with fromRawAmount().
            const evaSold = fill ? fromRawAmount(fill.rawInputAmount, EVA_DECIMALS) : fromRawAmount(order.rawMakingAmount, EVA_DECIMALS);
            const proceedsUsd = fill ? fromRawAmount(fill.rawOutputAmount, USDC_DECIMALS) : fromRawAmount(order.rawTakingAmount, USDC_DECIMALS);
            // Fee is charged in the output token (USDC) when Jupiter takes one; 0 for plain trigger orders without a referral fee.
            const feeUsd = fill && fill.feeMint === USDC_MINT ? fromRawAmount(fill.rawFeeAmount, USDC_DECIMALS) : 0;

            const costBasisUsd = Number(lot.buyPriceUsd) * evaSold;
            // The buy-side network fee applies to the WHOLE lot, not just
            // the slice being sold here — allocate it proportionally so a
            // lot that's only partially sold doesn't have the full buy fee
            // charged against just this sale. This is what "net P&L" is
            // supposed to mean per the schema comment on realizedPnlUsd.
            const evaAcquiredNum = Number(lot.evaAcquired);
            const buyFeeShare = evaAcquiredNum > 0 ? Number(lot.buyFeeUsd) * (evaSold / evaAcquiredNum) : 0;
            const realizedPnlUsd = proceedsUsd - feeUsd - costBasisUsd - buyFeeShare;

            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "FILLED",
                    soldAt: fill ? new Date(fill.confirmedAt) : now,
                    evaSold,
                    sellProceedsUsd: proceedsUsd,
                    sellFeeUsd: feeUsd,
                    sellTxSignature: fill?.txId,
                    realizedPnlUsd,
                    evaRemaining: Number(lot.evaAcquired) - evaSold,
                    lastCheckedAt: now,
                },
            });
            result.filled++;
            await notifyOrderFilled({
                chain: "Solana",
                tokenSymbol: "Eva",
                tokenSold: evaSold,
                sellProceedsUsd: proceedsUsd,
                realizedPnlUsd,
                sellFeeUsd: feeUsd,
                sellTxUrl: fill?.txId ? `https://solscan.io/tx/${fill.txId}` : undefined,
            });
        } else if (order.status === "Cancelled") {
            await db.evaLot.update({
                where: { id: lot.id },
                data: { status: "CANCELLED", evaRemaining: lot.evaAcquired, lastCheckedAt: now },
            });
            result.cancelled++;
        } else {
            await db.evaLot.update({ where: { id: lot.id }, data: { lastCheckedAt: now } });
        }
    }

    return result;
}

/**
 * Manual "check now" — reconciles this user's open sell orders against
 * Jupiter without touching the buy side (no new purchase, no interval
 * check). Lets the user confirm on demand that an order actually landed
 * or filled, instead of waiting for the next scheduled cron pass.
 */
export async function reconcileEvaOrdersForUser(userId: string): Promise<ReconcileResult> {
    const settings = await db.evaSettings.findUnique({ where: { userId } });
    if (!settings) return { checked: 0, filled: 0, cancelled: 0 };
    return reconcileOpenLots(userId, settings.walletAddress);
}

/**
 * Retries placing the take-profit sell order for any lot stuck in
 * PENDING_SELL_ORDER — i.e. the buy went through on-chain but something
 * (an RPC hiccup, a Jupiter API error, a crash) prevented the sell order
 * from being created right after. Without this, such a lot would sit there
 * forever: nothing else in the app ever revisits PENDING_SELL_ORDER, since
 * reconcileOpenLots only looks at status OPEN. Runs on every cron pass,
 * before the interval-gated buy check, so a stuck lot gets fixed even on a
 * day the interval isn't due for a fresh buy. Mirrors the SOL/BNB/EVM side.
 */
async function retryPendingSellOrders(
    userId: string,
    settings: { takeProfitPercent: unknown; sellAmountUsd: unknown },
    keypair: Keypair,
): Promise<void> {
    const stuckLots = await db.evaLot.findMany({ where: { userId, status: "PENDING_SELL_ORDER" } });
    for (const lot of stuckLots) {
        try {
            // A lot that already had a sell order (e.g. one mid-migration to V2) keeps its
            // original target/amount; a lot that never got one is computed from the settings.
            const targetPriceUsd = lot.targetPriceUsd
                ? Number(lot.targetPriceUsd)
                : Number(lot.buyPriceUsd) * (1 + Number(settings.takeProfitPercent) / 100);
            const sellAmountEva = lot.sellAmountEvaPlanned ? Number(lot.sellAmountEvaPlanned) : Number(settings.sellAmountUsd) / targetPriceUsd;

            const { orderKey, txSignature, version } = await placeSellOrder({
                keypair,
                evaAmount: sellAmountEva,
                targetPriceUsd,
                proceedsUsd: sellAmountEva * targetPriceUsd,
                forceV2: lot.triggerVersion === 2,
            });

            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    sellAmountEvaPlanned: sellAmountEva,
                    jupiterOrderKey: orderKey,
                    triggerVersion: version,
                    sellOrderCreatedAt: new Date(),
                    sellOrderTxSignature: txSignature,
                    notes: null,
                },
            });

            await notifyOrderPlaced({
                chain: "Solana",
                tokenSymbol: "Eva",
                buyAmountUsd: Number(lot.buyAmountUsd),
                tokenAcquired: Number(lot.evaAcquired),
                buyPriceUsd: Number(lot.buyPriceUsd),
                targetPriceUsd,
                takeProfitPercent: Number(settings.takeProfitPercent),
                sellAmountPlanned: sellAmountEva,
                buyTxUrl: lot.buyTxSignature ? `https://solscan.io/tx/${lot.buyTxSignature}` : undefined,
            });
        } catch (err) {
            // Still stuck — leave it for the next cron pass to retry again.
            const message = err instanceof Error ? err.message : String(err);
            await db.evaLot.update({
                where: { id: lot.id },
                data: { notes: `Sell order retry failed: ${message}` },
            });
        }
    }
}

/**
 * Runs one DCA cycle for a single user: reconciles previously-open sell
 * orders, then — if `intervalHours` have elapsed since the last buy — buys
 * `buyAmountUsd` of EVA and places a take-profit trigger sell order for
 * `sellAmountUsd` of it at `+takeProfitPercent`. Safe to call more often
 * than the configured interval; it no-ops until it's actually due. Mirrors
 * dca.ts's runSolanaDcaForUser — same bot wallet (SOLANA_PRIVATE_KEY),
 * different mint (EVA_MINT) and much wider default slippage (see
 * EvaSettings.slippageBps comment in the schema).
 */
export async function runEvaDcaForUser(userId: string): Promise<DcaRunResult> {
    const settings = await db.evaSettings.findUnique({ where: { userId } });
    if (!settings || !settings.enabled) return { userId, action: "skipped", reason: "disabled" };

    try {
        await reconcileOpenLots(userId, settings.walletAddress);

        // Keypair is needed both for retrying any stuck sell order and for
        // a fresh buy, so load it up front — independent of whether a new
        // buy is due today. Same env var as the SOL module — this bot
        // reuses that wallet, it does not have its own key.
        const keypair = loadBotKeypair();
        if (keypair.publicKey.toBase58() !== settings.walletAddress) {
            throw new Error("SOLANA_PRIVATE_KEY does not match the wallet address configured in settings — refusing to trade.");
        }

        // A lot can be stuck in PENDING_SELL_ORDER if a previous run's buy
        // succeeded on-chain but placing the sell order afterwards failed
        // (RPC hiccup, Jupiter API error, etc.). Retry those every pass,
        // regardless of whether a new buy is due.
        await retryPendingSellOrders(userId, settings, keypair);

        const dueAt = settings.lastRunAt
            ? new Date(settings.lastRunAt.getTime() + settings.intervalHours * 60 * 60 * 1000)
            : null;
        if (dueAt && dueAt.getTime() > Date.now()) {
            return { userId, action: "skipped", reason: `next buy due at ${dueAt.toISOString()}` };
        }

        const sellAmountUsd = Number(settings.sellAmountUsd);
        if (sellAmountUsd < MIN_TRIGGER_ORDER_USD) {
            throw new Error(`sellAmountUsd must be at least $${MIN_TRIGGER_ORDER_USD} (Jupiter Trigger API minimum)`);
        }

        // 1) Buy: USDC -> EVA. Uses Jupiter's Ultra order/execute API, not
        // the classic Swap API the SOL module uses — EVA's thin liquidity
        // makes the classic /swap/v1/quote reject it outright with
        // TOKEN_NOT_TRADABLE, even though a real (if pricier) route exists
        // through SOL. Confirmed by hand before switching this over; see
        // the comment above getUltraOrder in jupiter.ts for the full story.
        // settings.slippageBps is not used here — Ultra manages its own
        // execution slippage.
        const buyAmountUsd = Number(settings.buyAmountUsd);
        const order = await getUltraOrder({
            inputMint: USDC_MINT,
            outputMint: EVA_MINT,
            amount: toRawAmount(buyAmountUsd, USDC_DECIMALS),
            taker: keypair.publicKey.toBase58(),
        });
        // The pre-trade quote's implied price — kept only for display (see
        // EvaLot.quotedPriceUsd), so the settings/stats UI can show how much
        // slippage happened between this quote and the actual fill below.
        const quotedEvaAmount = fromRawAmount(order.outAmount, EVA_DECIMALS);
        const quotedPriceUsd = quotedEvaAmount > 0 ? buyAmountUsd / quotedEvaAmount : null;

        const { signature: buyTxSignature, outAmountRaw, feeLamports } = await executeUltraOrder(order, keypair);

        // Actual filled amount, not the pre-trade quote — meaningful here
        // given EVA's price impact is a few percent, not a rounding error.
        const evaAcquired = fromRawAmount(outAmountRaw, EVA_DECIMALS);
        const buyPriceUsd = buyAmountUsd / evaAcquired;
        // Network fee is paid in SOL (the gas token) regardless of which
        // SPL token is being traded — convert to USD via the SOL price at
        // buy time, same approach as the SOL module (a few thousand
        // lamports, well under a cent either way).
        const solPriceUsd = await getTokenPriceUsd(SOL_MINT).catch(() => 0);
        const buyFeeUsd = (feeLamports / 10 ** SOL_DECIMALS) * solPriceUsd;

        const lot = await db.evaLot.create({
            data: {
                userId,
                status: "PENDING_SELL_ORDER",
                buyAmountUsd,
                evaAcquired,
                buyPriceUsd,
                quotedPriceUsd,
                buyFeeUsd,
                buyTxSignature,
                evaRemaining: evaAcquired,
            },
        });

        // 2) Place the take-profit sell order for the configured USD slice of this lot.
        try {
            const targetPriceUsd = buyPriceUsd * (1 + Number(settings.takeProfitPercent) / 100);
            const sellAmountEva = sellAmountUsd / targetPriceUsd;

            const { orderKey, txSignature, version } = await placeSellOrder({
                keypair,
                evaAmount: sellAmountEva,
                targetPriceUsd,
                proceedsUsd: sellAmountUsd,
            });

            await db.evaLot.update({
                where: { id: lot.id },
                data: {
                    status: "OPEN",
                    targetPriceUsd,
                    sellAmountEvaPlanned: sellAmountEva,
                    jupiterOrderKey: orderKey,
                    triggerVersion: version,
                    sellOrderCreatedAt: new Date(),
                    sellOrderTxSignature: txSignature,
                },
            });

            await notifyOrderPlaced({
                chain: "Solana",
                tokenSymbol: "Eva",
                buyAmountUsd,
                tokenAcquired: evaAcquired,
                buyPriceUsd,
                targetPriceUsd,
                takeProfitPercent: Number(settings.takeProfitPercent),
                sellAmountPlanned: sellAmountEva,
                buyTxUrl: `https://solscan.io/tx/${buyTxSignature}`,
            });
        } catch (sellErr) {
            // Buy already succeeded and is on-chain — don't lose that. Leave the
            // lot as PENDING_SELL_ORDER so the next cron run (or a manual retry)
            // can attempt to place the sell order again.
            const message = sellErr instanceof Error ? sellErr.message : String(sellErr);
            await db.evaLot.update({
                where: { id: lot.id },
                data: { notes: `Sell order creation failed: ${message}` },
            });
        }

        await db.evaSettings.update({
            where: { userId },
            data: { lastRunAt: new Date(), lastRunStatus: "ok", lastRunError: null },
        });

        return { userId, action: "bought", lotId: lot.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.evaSettings.update({
            where: { userId },
            data: { lastRunStatus: "error", lastRunError: message },
        });
        return { userId, action: "error", reason: message };
    }
}

/** Entry point for the cron endpoint — runs every enabled user's cycle. */
export async function runEvaDcaForAllUsers(): Promise<DcaRunResult[]> {
    // Sweep has its own independent toggle (sweepEnabled) — a user could
    // want auto-sweep running even with DCA buying paused, or vice versa —
    // so this pulls in anyone opted into either, and only calls each
    // routine when its own flag is on.
    const settingsRows = await db.evaSettings.findMany({
        where: { OR: [{ enabled: true }, { sweepEnabled: true }] },
    });
    const results: DcaRunResult[] = [];
    for (const s of settingsRows) {
        if (s.enabled) {
            results.push(await runEvaDcaForUser(s.userId));
        }
        if (s.sweepEnabled) {
            try {
                await runEvaSweepForUser(s.userId);
            } catch (err) {
                console.error(`Eva sweep failed for user ${s.userId}`, err);
            }
        }
    }
    return results;
}

/** Current EVA price + a quick portfolio-level snapshot, for the settings page. */
export async function getEvaQuickStats(userId: string) {
    const [settings, lots, price] = await Promise.all([
        db.evaSettings.findUnique({ where: { userId } }),
        db.evaLot.findMany({ where: { userId }, orderBy: { boughtAt: "desc" } }),
        getTokenPriceUsd(EVA_MINT).catch(() => null),
    ]);
    return { settings, lots, evaPriceUsd: price };
}


// --- Migration of stuck V1 sell orders to Trigger V2 ---

export interface MigrateLotResult {
    lotId: string;
    oldOrderKey: string;
    newOrderId: string;
    targetPriceUsd: number;
}

/**
 * Moves ONE open V1 sell order to Trigger V2, keeping the same lot, EVA
 * amount and target price:
 *   1. every check that can fail runs BEFORE touching the chain (lot state,
 *      order really still active on V1, value >= V2 minimum, V2 auth+vault);
 *   2. the lot is atomically claimed (OPEN -> PENDING_SELL_ORDER, version 2)
 *      so a double click can't run it twice;
 *   3. the V1 order is cancelled (EVA returns to the wallet), then
 *   4. the V2 order is created at the same target.
 * If step 3 fails the lot is restored untouched. If step 4 fails the EVA is
 * safe in the wallet and the lot stays PENDING_SELL_ORDER with version 2, so
 * the normal cron retry recreates the order on V2 (same target/amount).
 */
export async function migrateEvaLotToV2(userId: string, lotId: string): Promise<MigrateLotResult> {
    const settings = await db.evaSettings.findUnique({ where: { userId } });
    if (!settings) throw new Error("Setările botului EVA nu sunt configurate.");
    const lot = await db.evaLot.findFirst({ where: { id: lotId, userId } });
    if (!lot) throw new Error("Lotul nu există.");
    if (lot.status !== "OPEN") throw new Error(`Lotul nu are un ordin activ (status ${lot.status}).`);
    if (lot.triggerVersion === 2) throw new Error("Ordinul e deja pe V2.");
    if (!lot.jupiterOrderKey || !lot.targetPriceUsd || !lot.sellAmountEvaPlanned) {
        throw new Error("Lotul nu are cheia ordinului, ținta sau suma planificată — nu pot migra în siguranță.");
    }
    const oldKey = lot.jupiterOrderKey;
    const targetPriceUsd = Number(lot.targetPriceUsd);
    const plannedAmount = Number(lot.sellAmountEvaPlanned); // what the V1 order holds
    let evaAmount = plannedAmount; // what the V2 order will hold (may be topped up below)

    const keypair = loadBotKeypair();
    if (keypair.publicKey.toBase58() !== settings.walletAddress) {
        throw new Error("SOLANA_PRIVATE_KEY nu corespunde wallet-ului din setări — refuz să tranzacționez.");
    }

    // --- pre-flight (nothing on-chain yet) ---
    const activeV1 = await getActiveTriggerOrders(settings.walletAddress);
    if (!activeV1.has(oldKey)) {
        throw new Error("Ordinul nu mai e activ pe Jupiter V1 (probabil s-a executat sau anulat). Apasă „Verifică acum” și reîncearcă.");
    }
    const price = await getTokenPriceUsd(EVA_MINT);
    // V2 needs the deposit worth >= $10 at the CURRENT price. A lot keeps ~10% of its EVA
    // unsold (bought $10, sells a ~$10-at-target slice), so instead of refusing a slice that
    // is slightly short, top it up from the lot's OWN unsold EVA — never beyond what the lot
    // acquired. Same target price; the extra EVA just sells too, at that target.
    if (evaAmount * price < MIN_TRIGGER_V2_TARGET_USD) {
        const wanted = MIN_TRIGGER_V2_TARGET_USD / price;
        evaAmount = Math.floor(Math.min(wanted, Number(lot.evaAcquired)) * 1e6) / 1e6;
    }
    if (evaAmount * price < MIN_TRIGGER_V2_ORDER_USD + 0.05) {
        throw new Error(
            `Ordinul nu poate fi mutat pe V2: tot ce a cumpărat lotul (${Number(lot.evaAcquired).toFixed(4)} EVA) valorează acum $${(Number(lot.evaAcquired) * price).toFixed(2)}, iar V2 cere minim $${MIN_TRIGGER_V2_ORDER_USD}. Reîncearcă când prețul e mai mare. Nu am anulat nimic.`
        );
    }
    const token = await getTriggerV2Token(keypair); // proves API key + wallet signature work BEFORE cancelling
    await ensureTriggerV2Vault(token);

    // Free EVA in the wallet BEFORE cancelling — the cancel is confirmed by this going up by the order's amount.
    const evaBalanceBefore = await getSplTokenBalance(settings.walletAddress, EVA_MINT);

    const extraEva = evaAmount - plannedAmount;
    if (extraEva > 0 && evaBalanceBefore < extraEva) {
        throw new Error(`Completarea ordinului cere încă ${extraEva.toFixed(4)} EVA liber în wallet, dar sunt doar ${evaBalanceBefore.toFixed(4)}. Nu am anulat nimic.`);
    }

    // --- claim the lot atomically ---
    const claimed = await db.evaLot.updateMany({
        where: { id: lot.id, status: "OPEN", triggerVersion: 1, jupiterOrderKey: oldKey },
        data: {
            status: "PENDING_SELL_ORDER",
            triggerVersion: 2,
            sellAmountEvaPlanned: evaAmount, // so a cron retry recreates the SAME (topped-up) order
            notes: `Migrare V2 în curs (V1 ${oldKey})`,
        },
    });
    if (claimed.count !== 1) throw new Error("Lotul e deja în curs de migrare sau și-a schimbat starea.");

    // --- cancel V1 ---
    try {
        await cancelTriggerV1Order({ keypair, orderKey: oldKey });
    } catch (err) {
        await db.evaLot.update({
            where: { id: lot.id },
            data: { status: "OPEN", triggerVersion: 1, sellAmountEvaPlanned: plannedAmount, notes: null },
        });
        throw err;
    }
    // Confirm the cancel on-chain: the order's EVA must be back in the wallet. (Jupiter's
    // "active orders" list lags behind — it kept showing a cancelled order as Open — so it
    // is NOT used for this.) A balance read error is retried, never fatal on its own.
    let refunded = false;
    for (let i = 0; i < 8 && !refunded; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 3000));
        try {
            const now = await getSplTokenBalance(settings.walletAddress, EVA_MINT);
            refunded = now >= evaBalanceBefore + plannedAmount * 0.999;
        } catch {
            /* transient RPC error — retry */
        }
    }
    if (!refunded) {
        await db.evaLot.update({
            where: { id: lot.id },
            data: { notes: `V1 ${oldKey}: anulare trimisă dar EVA încă nerestituit în wallet. Lotul e în așteptare; cron-ul creează ordinul pe V2 când EVA e liber.` },
        });
        throw new Error("Anularea V1 a fost trimisă dar EVA nu a apărut încă în wallet. Lotul e în așteptare și va fi creat pe V2 automat.");
    }

    // --- create on V2, same target ---
    try {
        const placed = await placeSellOrder({
            keypair,
            evaAmount,
            targetPriceUsd,
            proceedsUsd: evaAmount * targetPriceUsd,
            forceV2: true,
            v2Token: token,
        });
        await db.evaLot.update({
            where: { id: lot.id },
            data: {
                status: "OPEN",
                triggerVersion: 2,
                jupiterOrderKey: placed.orderKey,
                sellOrderCreatedAt: new Date(),
                sellOrderTxSignature: placed.txSignature,
                lastCheckedAt: new Date(),
                sellAmountEvaPlanned: evaAmount,
                notes:
                    `Migrat de pe V1 (${oldKey}); ținta ${targetPriceUsd} păstrată.` +
                    (extraEva > 0 ? ` Completat cu ${extraEva.toFixed(4)} EVA din restul lotului (minim V2 $${MIN_TRIGGER_V2_ORDER_USD}).` : ""),
            },
        });
        return { lotId: lot.id, oldOrderKey: oldKey, newOrderId: placed.orderKey, targetPriceUsd };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.evaLot.update({
            where: { id: lot.id },
            data: { notes: `V1 ${oldKey} anulat; crearea pe V2 a eșuat: ${message}. EVA e în wallet, se reîncearcă automat.` },
        });
        throw new Error(`V1 a fost anulat, dar crearea pe V2 a eșuat: ${message}. EVA e în wallet și cron-ul reîncearcă automat.`);
    }
}

/**
 * Migrates every OPEN V1 lot whose target is at or below the current
 * price (i.e. the ones that "should already have filled"), one at a time,
 * stopping at the first failure so a systemic problem (bad API key, V2
 * outage) can't cancel more orders than it can recreate.
 */
export async function migrateStuckEvaLotsToV2(userId: string): Promise<{ migrated: MigrateLotResult[]; error?: string; skipped: number }> {
    const price = await getTokenPriceUsd(EVA_MINT);
    const lots = await db.evaLot.findMany({ where: { userId, status: "OPEN", triggerVersion: 1 }, orderBy: { boughtAt: "asc" } });
    const stuck = lots.filter((l) => l.targetPriceUsd && Number(l.targetPriceUsd) <= price);
    const migrated: MigrateLotResult[] = [];
    for (const lot of stuck) {
        try {
            migrated.push(await migrateEvaLotToV2(userId, lot.id));
        } catch (err) {
            return { migrated, error: err instanceof Error ? err.message : String(err), skipped: stuck.length - migrated.length };
        }
    }
    return { migrated, skipped: 0 };
}
