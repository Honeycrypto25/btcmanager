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

    // Read back the actual network fee paid (base fee + any priority fee), for accurate cost tracking.
    const txInfo = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    const feeLamports = txInfo?.meta?.fee ?? 0;

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
    inputAmount: string;
    outputAmount: string;
    feeAmount: string;
    feeMint: string;
    txId: string;
    confirmedAt: string;
}

export interface TriggerOrder {
    orderKey: string;
    status: "Open" | "Completed" | "Cancelled" | string;
    makingAmount: string;
    takingAmount: string;
    remainingMakingAmount: string;
    trades: TriggerOrderTrade[];
}

/** Looks up a single order's current state (active or history) by key, for reconciling a SolanaLot. */
export async function getTriggerOrderStatus(wallet: string, orderKey: string): Promise<TriggerOrder | null> {
    for (const orderStatus of ["active", "history"] as const) {
        const qs = new URLSearchParams({ user: wallet, orderStatus });
        const res = await jupiterFetch<{ orders: TriggerOrder[] }>(
            `${JUPITER_API_BASE}/trigger/v1/getTriggerOrders?${qs.toString()}`
        );
        const found = res.orders.find((o) => o.orderKey === orderKey);
        if (found) return found;
    }
    return null;
}

// --- Price API (used only to compute target price / display, not for polling decisions) ---

export async function getSolPriceUsd(): Promise<number> {
    const res = await jupiterFetch<{ data: Record<string, { price: string }> }>(
        `${JUPITER_API_BASE}/price/v2?ids=${SOL_MINT}`
    );
    const entry = Object.values(res.data)[0];
    if (!entry) throw new Error("Jupiter price API returned no data for SOL");
    return parseFloat(entry.price);
}
