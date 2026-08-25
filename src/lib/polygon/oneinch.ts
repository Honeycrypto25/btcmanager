import "server-only";
import { Contract, MaxUint256, parseUnits, formatUnits, type Wallet } from "ethers";
import {
    Sdk,
    Api,
    MakerTraits,
    Address as OneInchAddress,
    randBigInt,
    FetchProviderConnector,
    CursorPager,
    getLimitOrderContract,
    type LimitOrderApiItem,
} from "@1inch/limit-order-sdk";
import { UINT_40_MAX } from "@1inch/byte-utils";
import { AGGREGATION_ROUTER_V6, ONEINCH_SWAP_API_BASE, POLYGON_CHAIN_ID, NATIVE_PSEUDO_ADDRESS } from "./constants";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
];

function apiKey(): string {
    const key = process.env.ONEINCH_API_KEY;
    if (!key) throw new Error("ONEINCH_API_KEY is not set. Get one at https://portal.1inch.dev/ and add it in Vercel env vars.");
    return key;
}

function sdk(): Sdk {
    return new Sdk({ authKey: apiKey(), networkId: POLYGON_CHAIN_ID, httpConnector: new FetchProviderConnector() });
}

async function oneinchFetch<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" } });
    const body = await res.json();
    if (!res.ok) {
        throw new Error(`1inch API error (${res.status}) on ${url}: ${JSON.stringify(body)}`);
    }
    return body as T;
}

/**
 * Approves `spender` to move `token` on the wallet's behalf, but only if
 * the current allowance is insufficient — a one-time, effectively-forever
 * approval (max uint256) rather than a fresh approve() every trade.
 */
async function ensureAllowance(wallet: Wallet, tokenAddress: string, spender: string, amountNeeded: bigint): Promise<void> {
    const token = new Contract(tokenAddress, ERC20_ABI, wallet);
    const current: bigint = await token.allowance(await wallet.getAddress(), spender);
    if (current >= amountNeeded) return;
    const tx = await token.approve(spender, MaxUint256);
    await tx.wait();
}

// --- Classic Swap API (used for the sell leg — token -> USDC) ---

interface QuoteResponse {
    dstAmount: string;
}

interface SwapResponse {
    dstAmount: string;
    tx: { from: string; to: string; data: string; value: string; gas: number; gasPrice: string };
}

/** Derived from a real swap quote (1 unit of `tokenAddress` -> USDC) rather than a separate spot-price endpoint, so it reflects what the bot would actually get. */
export async function getTokenPriceUsd(tokenAddress: string, decimals: number, usdcAddress: string): Promise<number> {
    const oneUnit = parseUnits("1", decimals).toString();
    const qs = new URLSearchParams({ src: tokenAddress, dst: usdcAddress, amount: oneUnit });
    const res = await oneinchFetch<QuoteResponse>(`${ONEINCH_SWAP_API_BASE}/${POLYGON_CHAIN_ID}/quote?${qs.toString()}`);
    return Number(formatUnits(res.dstAmount, 6));
}

/** Price of native POL in USD, via a quote (native pseudo-address -> USDC) — needed to convert a gas fee (paid in POL) to USD, since the traded token's own price doesn't apply to it. */
export async function getNativePriceUsd(usdcAddress: string): Promise<number> {
    const oneNative = parseUnits("1", 18).toString();
    const qs = new URLSearchParams({ src: NATIVE_PSEUDO_ADDRESS, dst: usdcAddress, amount: oneNative });
    const res = await oneinchFetch<QuoteResponse>(`${ONEINCH_SWAP_API_BASE}/${POLYGON_CHAIN_ID}/quote?${qs.toString()}`);
    return Number(formatUnits(res.dstAmount, 6));
}

/** Builds, signs (by sending the returned tx) and confirms a swap. Returns the tx hash, gas paid (in native POL), and the destination amount received. */
export async function executeSwap(wallet: Wallet, params: {
    srcToken: string;
    dstToken: string;
    amountRaw: bigint;
    slippageBps: number;
}): Promise<{ txHash: string; feeNative: number; dstAmountRaw: string }> {
    const from = await wallet.getAddress();
    await ensureAllowance(wallet, params.srcToken, AGGREGATION_ROUTER_V6, params.amountRaw);

    const qs = new URLSearchParams({
        src: params.srcToken,
        dst: params.dstToken,
        amount: params.amountRaw.toString(),
        from,
        slippage: String(params.slippageBps / 100), // 1inch takes slippage as a percent, e.g. 3 for 3%
        disableEstimate: "true",
    });
    const quote = await oneinchFetch<SwapResponse>(`${ONEINCH_SWAP_API_BASE}/${POLYGON_CHAIN_ID}/swap?${qs.toString()}`);

    const sent = await wallet.sendTransaction({
        to: quote.tx.to,
        data: quote.tx.data,
        value: BigInt(quote.tx.value),
    });
    const receipt = await sent.wait();
    if (!receipt || receipt.status !== 1) {
        throw new Error(`Swap transaction failed on-chain (${sent.hash})`);
    }

    const feeNative = Number(formatUnits(receipt.gasUsed * receipt.gasPrice, 18));
    return { txHash: sent.hash, feeNative, dstAmountRaw: quote.dstAmount };
}

// --- Limit Order Protocol v4 (used for the buy-back order) ---

/**
 * Signs (gasless, off-chain) and submits a fill-or-kill limit order — the
 * maker gives `makingAmountRaw` of `makerAsset` for `takingAmountRaw` of
 * `takerAsset` once a resolver takes it. Generic over which side is which
 * (unlike the Base/BNB version this was cloned from, which always sold the
 * traded token for USDC): for the reverse-DCA buy-back order,
 * makerAsset = USDC, takerAsset = the token being reacquired.
 */
export async function createLimitOrder(wallet: Wallet, params: {
    makerAsset: string;
    takerAsset: string;
    makingAmountRaw: bigint;
    takingAmountRaw: bigint;
    expirationSeconds: number; // how far out the order is valid for, from now
}): Promise<{ orderHash: string }> {
    const maker = await wallet.getAddress();
    await ensureAllowance(wallet, params.makerAsset, getLimitOrderContract(POLYGON_CHAIN_ID), params.makingAmountRaw);

    const expiration = BigInt(Math.floor(Date.now() / 1000) + params.expirationSeconds);
    const makerTraits = MakerTraits.default()
        .withExpiration(expiration)
        .withNonce(randBigInt(UINT_40_MAX))
        .disablePartialFills()
        .disableMultipleFills();

    const client = sdk();
    const order = await client.createOrder(
        {
            makerAsset: new OneInchAddress(params.makerAsset),
            takerAsset: new OneInchAddress(params.takerAsset),
            makingAmount: params.makingAmountRaw,
            takingAmount: params.takingAmountRaw,
            maker: new OneInchAddress(maker),
        },
        makerTraits
    );

    const typedData = order.getTypedData(POLYGON_CHAIN_ID);
    const signature = await wallet.signTypedData(typedData.domain, { Order: typedData.types.Order }, typedData.message);

    await client.submitOrder(order, signature);
    return { orderHash: order.getOrderHash(POLYGON_CHAIN_ID) };
}

function api(): Api {
    return new Api({ authKey: apiKey(), networkId: POLYGON_CHAIN_ID, httpConnector: new FetchProviderConnector() });
}

/**
 * Fetches every currently-active (status=1, "valid") limit order for a
 * wallet, across all cursor pages — used to reconcile ALL open lots against
 * 1inch's orderbook in one batched pass. Keyed by orderHash.
 */
export async function getActiveOrders(makerAddress: string): Promise<Map<string, LimitOrderApiItem>> {
    const client = api();
    const byHash = new Map<string, LimitOrderApiItem>();
    let cursor: string | undefined;
    do {
        const pager = cursor ? new CursorPager({ limit: 100, cursor }) : new CursorPager({ limit: 100 });
        const res = await client.getOrdersByMaker(new OneInchAddress(makerAddress), { pager, statuses: [1] });
        for (const item of res.items) byHash.set(item.orderHash, item);
        cursor = res.meta.hasMore ? res.meta.nextCursor : undefined;
    } while (cursor);
    return byHash;
}

/** Looks up a single order's current state — used only for orders that just dropped out of the active list. Returns null if 1inch has no record of it. */
export async function getOrderByHash(orderHash: string): Promise<LimitOrderApiItem | null> {
    try {
        return await api().getOrderByHash(orderHash);
    } catch {
        return null;
    }
}
