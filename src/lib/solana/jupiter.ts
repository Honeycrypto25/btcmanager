import "server-only";
import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";
import { createPrivateKey, sign as ed25519Sign } from "crypto";
import bs58 from "bs58";
import { JUPITER_API_BASE, SOL_MINT } from "./constants";
import { getRpcUrl } from "./wallet";

function jupiterHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Optional — an API key raises Jupiter's free-tier rate limits. Not
    // required for the volumes this bot runs at (a couple of calls/day).
    if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
    return headers;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch() that waits and retries on Jupiter's 429 "Too many requests"
 * (the free API-key tier allows ~1 request/second, and a migration or a
 * multi-page reconcile fires several back to back). Honors Retry-After
 * when present; gives up after 5 tries.
 */
async function fetchWithRateLimitRetry(url: string, init: RequestInit): Promise<Response> {
    let res = await fetch(url, init);
    for (let attempt = 1; res.status === 429 && attempt <= 5; attempt++) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1200 * attempt);
        res = await fetch(url, init);
    }
    return res;
}

async function jupiterFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithRateLimitRetry(url, { ...init, headers: { ...jupiterHeaders(), ...(init?.headers || {}) } });
    const body = await res.json();
    if (!res.ok) {
        throw new Error(`Jupiter API error (${res.status}) on ${url}: ${JSON.stringify(body)}`);
    }
    return body as T;
}

// --- Swap API (used for the daily buy) ---

export interface QuoteResponse {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    otherAmountThreshold: string;
    slippageBps: number;
    priceImpactPct: string;
    [key: string]: unknown;
}

export async function getSwapQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string; // raw/atomic units
    slippageBps: number;
}): Promise<QuoteResponse> {
    const qs = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: String(params.slippageBps),
        restrictIntermediateTokens: "true",
    });
    return jupiterFetch<QuoteResponse>(`${JUPITER_API_BASE}/swap/v1/quote?${qs.toString()}`);
}

interface SwapTxResponse {
    swapTransaction: string; // base64
}

/** Builds, signs, sends and confirms a swap transaction from a quote. Returns the tx signature. */
export async function executeSwap(quoteResponse: QuoteResponse, keypair: Keypair): Promise<{ signature: string; feeLamports: number }> {
    const { swapTransaction } = await jupiterFetch<SwapTxResponse>(`${JUPITER_API_BASE}/swap/v1/swap`, {
        method: "POST",
        body: JSON.stringify({
            quoteResponse,
            userPublicKey: keypair.publicKey.toBase58(),
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "high" },
            },
        }),
    });

    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
    tx.sign([keypair]);

    const connection = new Connection(getRpcUrl(), "confirmed");
    const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (confirmation.value.err) {
        throw new Error(`Swap transaction failed on-chain: ${JSON.stringify(confirmation.value.err)} (${signature})`);
    }

    // Read back the actual network fee paid (base fee + any priority fee), for
    // accurate cost tracking. confirmTransaction() resolving doesn't guarantee
    // getTransaction() can find the tx yet — RPC read replicas can lag the
    // write path by a beat, especially right after sendRawTransaction with
    // skipPreflight. Retry briefly rather than silently recording a $0 fee.
    let feeLamports = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
        const txInfo = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
        if (txInfo?.meta) {
            feeLamports = txInfo.meta.fee;
            break;
        }
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }

    return { signature, feeLamports };
}

// --- Ultra API (used for the Eva buy — see the comment below) ---
//
// The classic Swap API above (a.k.a. "Metis") flat-out refuses to quote
// some very thin/low-liquidity SPL tokens with a routing-level
// TOKEN_NOT_TRADABLE error, even when a real route exists — confirmed by
// hand for EVA (~$3k pool): /swap/v1/quote rejects USDC->EVA outright,
// while Jupiter's newer Ultra order/execute API finds a route through
// SOL (USDC->SOL->EVA) at ~-2.2% price impact. Ultra also does its own
// submission/landing (no separate sendRawTransaction/confirmTransaction
// step needed) and reports the ACTUAL filled output amount rather than a
// pre-trade quote. Used only for eva-dca.ts's buy step; the SOL module
// keeps using the classic Swap API above since it works fine there and
// there's no reason to touch working code.
const ULTRA_API_BASE = "https://lite-api.jup.ag/ultra/v1";

export interface UltraOrderResponse {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    priceImpactPct: string;
    transaction: string | null; // null if no route / no taker provided
    requestId: string;
    [key: string]: unknown;
}

/**
 * Ultra has no slippageBps request param — unlike the classic Swap API, it
 * manages execution slippage itself as part of "handling ... transaction
 * landing" (per Jupiter's docs), so EvaSettings.slippageBps is not
 * consulted for this call.
 */
export async function getUltraOrder(params: {
    inputMint: string;
    outputMint: string;
    amount: string; // raw/atomic units
    taker: string; // wallet that will sign — required to get back a signable `transaction`
}): Promise<UltraOrderResponse> {
    const qs = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        taker: params.taker,
    });
    const order = await jupiterFetch<UltraOrderResponse>(`${ULTRA_API_BASE}/order?${qs.toString()}`);
    if (!order.transaction) {
        throw new Error(
            `Jupiter Ultra order returned no route/transaction for ${params.inputMint} -> ${params.outputMint} (requestId ${order.requestId})`
        );
    }
    return order;
}

interface UltraExecuteResponse {
    status: "Success" | "Failed";
    signature: string;
    code: number;
    error?: string;
    inputAmountResult?: string;
    outputAmountResult?: string;
}

/** Signs and submits an Ultra order. Returns the actual filled output amount (raw units), not the pre-trade quote. */
export async function executeUltraOrder(
    order: UltraOrderResponse,
    keypair: Keypair
): Promise<{ signature: string; outAmountRaw: string; feeLamports: number }> {
    const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction as string, "base64"));
    tx.sign([keypair]);
    const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

    const executed = await jupiterFetch<UltraExecuteResponse>(`${ULTRA_API_BASE}/execute`, {
        method: "POST",
        body: JSON.stringify({ signedTransaction, requestId: order.requestId }),
    });

    if (executed.status !== "Success") {
        throw new Error(`Ultra swap failed: ${executed.error ?? "unknown error"} (code ${executed.code}, tx ${executed.signature})`);
    }

    // Ultra handles submission/landing itself, so — unlike executeSwap
    // above — there's no confirmTransaction step here. The execute
    // response doesn't include the network fee, so read it back the same
    // retry-tolerant way as executeSwap does.
    const connection = new Connection(getRpcUrl(), "confirmed");
    let feeLamports = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
        const txInfo = await connection.getTransaction(executed.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
        if (txInfo?.meta) {
            feeLamports = txInfo.meta.fee;
            break;
        }
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }

    return {
        signature: executed.signature,
        outAmountRaw: executed.outputAmountResult ?? order.outAmount,
        feeLamports,
    };
}

// --- Trigger API (used for the take-profit sell order) ---

interface CreateOrderResponse {
    order: string; // Jupiter's order account/key
    transaction: string; // base64, unsigned
    requestId: string;
}

export async function createTriggerSellOrder(params: {
    keypair: Keypair;
    inputMint: string; // SOL
    outputMint: string; // USDC
    makingAmountRaw: string; // SOL being sold, raw lamports
    takingAmountRaw: string; // USDC to receive at target price, raw units
}): Promise<{ orderKey: string; txSignature: string }> {
    const owner = params.keypair.publicKey.toBase58();
    const created = await jupiterFetch<CreateOrderResponse>(`${JUPITER_API_BASE}/trigger/v1/createOrder`, {
        method: "POST",
        body: JSON.stringify({
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            maker: owner,
            payer: owner,
            params: {
                makingAmount: params.makingAmountRaw,
                takingAmount: params.takingAmountRaw,
            },
            computeUnitPrice: "auto",
        }),
    });

    const tx = VersionedTransaction.deserialize(Buffer.from(created.transaction, "base64"));
    tx.sign([params.keypair]);
    const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

    const executed = await jupiterFetch<{ signature: string; status: string; error?: string }>(
        `${JUPITER_API_BASE}/trigger/v1/execute`,
        {
            method: "POST",
            body: JSON.stringify({ signedTransaction, requestId: created.requestId }),
        }
    );

    if (executed.status !== "Success") {
        throw new Error(`Failed to place trigger sell order: ${executed.error ?? "unknown error"}`);
    }

    return { orderKey: created.order, txSignature: executed.signature };
}

export interface TriggerOrderTrade {
    // Jupiter's history API returns BOTH a human-readable decimal string
    // (inputAmount/outputAmount/feeAmount) AND the raw atomic-unit string
    // (rawInputAmount/rawOutputAmount/rawFeeAmount) for the same value —
    // easy to miss since the decimal ones read like they could be raw.
    // Always use the raw* fields with fromRawAmount(); dividing the
    // already-decimal fields by 10**decimals a second time silently
    // produces a number that's off by a factor of 10**decimals (~10^9),
    // rounding every fill to $0.00 / 0 SOL sold instead of throwing.
    inputAmount: string;
    outputAmount: string;
    feeAmount: string;
    rawInputAmount: string;
    rawOutputAmount: string;
    rawFeeAmount: string;
    feeMint: string;
    txId: string;
    confirmedAt: string;
}

export interface TriggerOrder {
    orderKey: string;
    status: "Open" | "Completed" | "Cancelled" | string;
    makingAmount: string;
    takingAmount: string;
    rawMakingAmount: string;
    rawTakingAmount: string;
    remainingMakingAmount: string;
    trades: TriggerOrderTrade[];
}

interface GetTriggerOrdersResponse {
    orders: TriggerOrder[];
    totalPages: number;
    page: number;
}

/**
 * Fetches every currently-active (Open) trigger order for a wallet, across
 * all pages (10 orders/page), in a bounded, small number of requests —
 * used to reconcile ALL open lots against Jupiter in one batched pass
 * instead of one lookup per lot. Keyed by orderKey for O(1) matching.
 */
export async function getActiveTriggerOrders(wallet: string): Promise<Map<string, TriggerOrder>> {
    const byKey = new Map<string, TriggerOrder>();
    let page = 1;
    let totalPages = 1;
    do {
        const qs = new URLSearchParams({ user: wallet, orderStatus: "active", page: String(page) });
        const res = await jupiterFetch<GetTriggerOrdersResponse>(`${JUPITER_API_BASE}/trigger/v1/getTriggerOrders?${qs.toString()}`);
        for (const order of res.orders) byKey.set(order.orderKey, order);
        totalPages = res.totalPages || 1;
        page++;
        if (page <= totalPages) await sleep(1100);
    } while (page <= totalPages);
    return byKey;
}

/**
 * Looks up a single order's final state in the (paginated) history —
 * used only for orders that just dropped out of the active list, i.e.
 * actually need their fill/cancel details. NOT meant to be called per
 * lot on every run; see getActiveTriggerOrders for the batched check.
 */
export async function getHistoricalTriggerOrder(wallet: string, orderKey: string): Promise<TriggerOrder | null> {
    let page = 1;
    let totalPages = 1;
    do {
        const qs = new URLSearchParams({ user: wallet, orderStatus: "history", page: String(page) });
        const res = await jupiterFetch<GetTriggerOrdersResponse>(`${JUPITER_API_BASE}/trigger/v1/getTriggerOrders?${qs.toString()}`);
        const found = res.orders.find((o) => o.orderKey === orderKey);
        if (found) return found;
        totalPages = res.totalPages || 1;
        page++;
        if (page <= totalPages) await sleep(1100);
    } while (page <= totalPages);
    return null;
}

// --- Price API (used only to compute target price / display, not for polling decisions) ---

/**
 * Generic single-mint USD price lookup — used by both the SOL and Eva
 * modules (getSolPriceUsd below just calls this with SOL_MINT). Price API
 * v2 was deprecated (Aug 2025) and stopped reliably returning data — v3
 * has a different response shape: no `data` wrapper, and the field is
 * `usdPrice` (number) instead of `price` (string).
 */
export async function getTokenPriceUsd(mint: string): Promise<number> {
    const res = await jupiterFetch<Record<string, { usdPrice: number }>>(
        `${JUPITER_API_BASE}/price/v3?ids=${mint}`
    );
    const entry = res[mint];
    if (!entry) throw new Error(`Jupiter price API returned no data for mint ${mint}`);
    return entry.usdPrice;
}

export async function getSolPriceUsd(): Promise<number> {
    return getTokenPriceUsd(SOL_MINT);
}


// --- Trigger V1: cancel (used only to migrate stuck V1 sell orders to V2) ---

/**
 * Cancels a V1 trigger order: Jupiter crafts the cancel tx, we sign it,
 * and /execute lands it. The order's remaining tokens go back to the
 * maker wallet. Throws unless Jupiter reports Success.
 */
export async function cancelTriggerV1Order(params: { keypair: Keypair; orderKey: string }): Promise<{ txSignature: string }> {
    const maker = params.keypair.publicKey.toBase58();
    const crafted = await jupiterFetch<{ transaction: string; requestId: string }>(`${JUPITER_API_BASE}/trigger/v1/cancelOrder`, {
        method: "POST",
        body: JSON.stringify({ maker, order: params.orderKey, computeUnitPrice: "auto" }),
    });
    const tx = VersionedTransaction.deserialize(Buffer.from(crafted.transaction, "base64"));
    tx.sign([params.keypair]);
    const executed = await jupiterFetch<{ signature: string; status: string; error?: string }>(`${JUPITER_API_BASE}/trigger/v1/execute`, {
        method: "POST",
        body: JSON.stringify({ signedTransaction: Buffer.from(tx.serialize()).toString("base64"), requestId: crafted.requestId }),
    });
    if (executed.status !== "Success") {
        throw new Error(`Anularea ordinului V1 ${params.orderKey} a eșuat: ${executed.error ?? "eroare necunoscută"}`);
    }
    return { txSignature: executed.signature };
}

// --- Trigger V2 (USD-price triggers, Privy vault, JWT auth) ---
//
// Why V2: V1 orders for EVA were never filled by Jupiter's keepers even
// while the price sat well above target for hours (EVA's pool is thin and
// V1 keepers route through the classic engine that rejects EVA as
// TOKEN_NOT_TRADABLE — see the comment above getUltraOrder). V2 triggers
// on Jupiter's USD price and executes through the newer routing stack.
// Docs: https://developers.jup.ag/docs/trigger  (base: /trigger/v2)
// An x-api-key is REQUIRED on every V2 endpoint.

const TRIGGER_V2_BASE = `${JUPITER_API_BASE}/trigger/v2`;

function triggerV2ApiKey(): string {
    const key = process.env.JUPITER_API_KEY;
    if (!key) {
        throw new Error("JUPITER_API_KEY lipsește — Jupiter Trigger V2 cere cheie API (o generezi gratuit pe portal.jup.ag și o adaugi în Vercel).");
    }
    return key;
}

async function v2Fetch<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-api-key": triggerV2ApiKey() };
    if (init.token) headers["Authorization"] = `Bearer ${init.token}`;
    const res = await fetchWithRateLimitRetry(`${TRIGGER_V2_BASE}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        /* non-JSON error body — keep the raw text for the message below */
    }
    if (!res.ok) {
        throw new Error(`Jupiter Trigger V2 (${res.status}) ${init.method ?? "GET"} ${path}: ${text.slice(0, 500)}`);
    }
    return json as T;
}

/** Ed25519-signs a UTF-8 message with the bot keypair (Node crypto, no extra dependency) and returns the base58 signature. */
function signMessageBase58(keypair: Keypair, message: string): string {
    const seed = Buffer.from(keypair.secretKey.slice(0, 32));
    // PKCS#8 wrapper around a raw 32-byte Ed25519 seed.
    const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
    const key = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
    return bs58.encode(ed25519Sign(null, Buffer.from(message, "utf8"), key));
}

/** Challenge/verify auth → 24h JWT. Nothing is moved by this; a leaked JWT can cancel/edit orders but never withdraw funds. */
export async function getTriggerV2Token(keypair: Keypair): Promise<string> {
    const walletPubkey = keypair.publicKey.toBase58();
    const { challenge } = await v2Fetch<{ challenge: string }>("/auth/challenge", {
        method: "POST",
        body: { walletPubkey, type: "message" },
    });
    const signature = signMessageBase58(keypair, challenge);
    // The docs show two slightly different verify bodies (with `walletPubkey`, or with `challenge`) —
    // send the first, and fall back to the second on a 4xx so either shape works.
    let verified: { token?: string };
    try {
        verified = await v2Fetch<{ token?: string }>("/auth/verify", { method: "POST", body: { type: "message", walletPubkey, signature } });
    } catch {
        verified = await v2Fetch<{ token?: string }>("/auth/verify", { method: "POST", body: { type: "message", walletPubkey, challenge, signature } });
    }
    if (!verified.token) throw new Error("Jupiter Trigger V2: autentificarea nu a întors un token.");
    return verified.token;
}

/** Makes sure the wallet's Privy vault exists (one-time registration). */
export async function ensureTriggerV2Vault(token: string): Promise<void> {
    try {
        await v2Fetch("/vault", { token });
    } catch {
        // First use: register is a GET per Jupiter's docs. 409 means the vault
        // already exists (e.g. GET /vault failed for another reason) — fine.
        try {
            await v2Fetch("/vault/register", { token });
        } catch (err) {
            if (!(err instanceof Error && err.message.includes("(409)"))) throw err;
        }
    }
}

/**
 * Places a single "sell when USD price is above X" order: crafts the
 * deposit (tokens move wallet → Privy vault), signs it, and creates the
 * order. A 200 means the deposit landed and the order is live.
 */
export async function createTriggerV2SellOrder(params: {
    keypair: Keypair;
    token: string;
    inputMint: string;
    outputMint: string;
    inputAmountRaw: string;
    triggerMint: string;
    triggerPriceUsd: number;
    slippageBps: number;
    expiresAtMs: number;
}): Promise<{ orderId: string; txSignature: string }> {
    const userPubkey = params.keypair.publicKey.toBase58();

    const deposit = await v2Fetch<{ requestId: string; transaction: string }>("/deposit/craft", {
        method: "POST",
        token: params.token,
        body: {
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            userAddress: userPubkey,
            amount: params.inputAmountRaw,
            orderType: "price",
            orderSubType: "single",
        },
    });
    const tx = VersionedTransaction.deserialize(Buffer.from(deposit.transaction, "base64"));
    tx.sign([params.keypair]);

    const order = await v2Fetch<{ id: string; txSignature: string; depositConfirmed?: boolean }>("/orders/price", {
        method: "POST",
        token: params.token,
        body: {
            orderType: "single",
            depositRequestId: deposit.requestId,
            depositSignedTx: Buffer.from(tx.serialize()).toString("base64"),
            userPubkey,
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            inputAmount: params.inputAmountRaw,
            triggerMint: params.triggerMint,
            triggerCondition: "above",
            triggerPriceUsd: params.triggerPriceUsd,
            slippageBps: params.slippageBps,
            expiresAt: params.expiresAtMs,
        },
    });
    if (!order.id) throw new Error("Jupiter Trigger V2: crearea ordinului nu a întors un id.");
    return { orderId: order.id, txSignature: order.txSignature };
}

export interface TriggerV2Event {
    type: string; // "deposit" | "fill" | "withdrawal" | "cancelled" | "expired"
    timestamp: number; // ms
    state?: string;
    txSignature?: string;
    mint?: string;
    amount?: string;
    outputMint?: string;
    outputAmount?: string;
}

export interface TriggerV2Order {
    id: string;
    orderState: string; // pending | open | executing | filled | pending_withdraw | cancelled | expired | failed
    rawState?: string;
    initialInputAmount?: string;
    remainingInputAmount?: string;
    triggerPriceUsd?: number;
    triggeredAt?: number;
    outputAmount?: string;
    inputUsed?: string;
    events?: TriggerV2Event[];
}

/** All V2 price orders in the given bucket ("active" or "past"), paged 100 at a time (bounded to 10 pages). */
export async function getTriggerV2Orders(token: string, state: "active" | "past"): Promise<TriggerV2Order[]> {
    const all: TriggerV2Order[] = [];
    for (let page = 0; page < 10; page++) {
        const qs = new URLSearchParams({ state, limit: "100", offset: String(page * 100) });
        const res = await v2Fetch<{ orders: TriggerV2Order[]; pagination?: { total: number } }>(`/orders/history?${qs.toString()}`, { token });
        all.push(...res.orders);
        if (res.orders.length < 100) break;
        await sleep(1100);
    }
    return all;
}
