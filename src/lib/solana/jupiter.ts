import "server-only";
import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";
import { JUPITER_API_BASE, SOL_MINT } from "./constants";
import { getRpcUrl } from "./wallet";

function jupiterHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Optional — an API key raises Jupiter's free-tier rate limits. Not
    // required for the volumes this bot runs at (a couple of calls/day).
    if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
    return headers;
}

async function jupiterFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { ...jupiterHeaders(), ...(init?.headers || {}) } });
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
