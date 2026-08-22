export const BNB_CHAIN_ID = 56;
export const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
export const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
export const USDT_DECIMALS = 18;
export const WBNB_DECIMALS = 18;
export const AGGREGATION_ROUTER_V6 = "0x111111125421cA6dc452d289314280a0f8842A65";
export const ONEINCH_SWAP_API_BASE = "https://api.1inch.dev/swap/v6.1";
export const MIN_LIMIT_ORDER_USD = 5;
export function getRpcUrl(): string {
    return process.env.BNB_RPC_URL || "https://bsc-dataseed.binance.org";
}
