// Polygon PoS mainnet addresses used throughout the reverse-DCA bot.
export const POLYGON_CHAIN_ID = 137;

// Circle's native USDC on Polygon (not the older bridged USDC.e at
// 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) — same "native, not bridged"
// convention as USDC_ADDRESS in src/lib/evm/constants.ts.
export const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
export const USDC_DECIMALS = 6;

// Native gas token — POL (Polygon's rebrand of MATIC), 18 decimals like ETH/BNB.
export const NATIVE_DECIMALS = 18;
// The pseudo-address 1inch (and most aggregators) use to represent the
// chain's native token in a swap quote — needed to price gas (paid in POL,
// a different asset from whichever token is being traded) in USD.
export const NATIVE_PSEUDO_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// 1inch Aggregation Router v6 — same address on every chain it's deployed to.
export const AGGREGATION_ROUTER_V6 = "0x111111125421cA6dc452d289314280a0f8842A65";

export const ONEINCH_SWAP_API_BASE = "https://api.1inch.dev/swap/v6.1";

/** Below this, a limit order isn't worth the resolver's gas to fill. Mirrors MIN_LIMIT_ORDER_USD on Base/BNB. */
export const MIN_LIMIT_ORDER_USD = 5;

export function getRpcUrl(): string {
    return process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
}

/**
 * Tokens this bot is allowed to run for — a small allow-list rather than
 * accepting any address from the settings form, so a typo'd address can't
 * accidentally try to trade an unrelated (or malicious) token. Add a row
 * here before it can be added from the /polygon settings page. Decimals are
 * NOT hardcoded — they're read live from the contract when a token is added
 * (see actions/polygon.ts), this list only pins which addresses are allowed.
 */
export const ALLOWED_TOKENS: { address: string; label: string }[] = [
    { address: "0xAC0F66379A6d7801D7726d5a943356A172549Adb", label: "GEODNET (GEOD)" },
    { address: "0x1379E8886A944d2D9d440b3d88DF536Aea08d9F3", label: "Mysterium (MYST)" },
];
