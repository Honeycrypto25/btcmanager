// Base mainnet addresses used throughout the EVM DCA bot.
export const BASE_CHAIN_ID = 8453;

// Circle's native USDC on Base (not the older bridged USDbC).
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Canonical WETH predeploy, identical address on every OP-stack chain.
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

export const USDC_DECIMALS = 6;
export const WETH_DECIMALS = 18;

// 1inch Aggregation Router v6 — same address on every chain it's deployed to.
export const AGGREGATION_ROUTER_V6 = "0x111111125421cA6dc452d289314280a0f8842A65";

export const ONEINCH_SWAP_API_BASE = "https://api.1inch.dev/swap/v6.1";

/** Below this, a limit order isn't worth the resolver's gas to fill. Mirrors MIN_TRIGGER_ORDER_USD on the Solana side. */
export const MIN_LIMIT_ORDER_USD = 5;

export function getRpcUrl(): string {
    return process.env.BASE_RPC_URL || "https://mainnet.base.org";
}
