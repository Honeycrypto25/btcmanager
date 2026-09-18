// Mainnet mint addresses used throughout the Solana DCA bot.
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const SOL_DECIMALS = 9;
export const USDC_DECIMALS = 6;

// Eva (SPL token) — second single-token DCA module, same bot wallet/APIs
// as SOL above. Mint + decimals confirmed via Jupiter's token API.
export const EVA_MINT = "9jxs9w5YRnPfchbW8f8hwhBSTvedSSvntfxvpqbL1jVH";
export const EVA_DECIMALS = 9;
export const EVA_SYMBOL = "Eva";

export const JUPITER_API_BASE = "https://api.jup.ag";

/** Jupiter Trigger API rejects orders below roughly this USD value. */
export const MIN_TRIGGER_ORDER_USD = 5;

/** Trigger V2 rejects deposits below ~$10 (input value at the CURRENT price, not at target). */
export const MIN_TRIGGER_V2_ORDER_USD = 10;
/** Slippage allowed when a V2 sell order fires (EVA's pool is thin: ~0.6% impact per $10 + fees). */
export const EVA_V2_SELL_SLIPPAGE_BPS = 300;
/** V2 orders need an expiry; V1 had none. */
export const TRIGGER_V2_ORDER_TTL_DAYS = 180;
