import "server-only";
import { Contract, JsonRpcProvider, Wallet, formatUnits } from "ethers";
import { getRpcUrl, USDC_ADDRESS, USDC_DECIMALS, NATIVE_DECIMALS } from "./constants";

const ERC20_BALANCE_ABI = ["function balanceOf(address owner) view returns (uint256)"];
const ERC20_META_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
];

/**
 * Loads the bot's EVM wallet from BASE_PRIVATE_KEY — deliberately the SAME
 * env var as the Base and BNB bots, not a separate POLYGON_PRIVATE_KEY. An
 * EVM private key produces the identical wallet address on every EVM chain
 * (Base, BNB, Polygon all share the same secp256k1 address space), and this
 * bot is meant to run on the same wallet Sergiu already uses for Base/BNB.
 */
export function loadBotWallet(): Wallet {
    const raw = process.env.BASE_PRIVATE_KEY;
    if (!raw) {
        throw new Error(
            "BASE_PRIVATE_KEY is not set. Add it in Vercel env vars — a 0x-prefixed private key for the bot wallet (shared with Base/BNB)."
        );
    }
    try {
        return new Wallet(raw.trim());
    } catch {
        throw new Error("BASE_PRIVATE_KEY is not a valid EVM private key.");
    }
}

export function getProvider(): JsonRpcProvider {
    return new JsonRpcProvider(getRpcUrl());
}

/** The bot wallet, connected to a live provider — ready to sign and send transactions. */
export function loadConnectedBotWallet(): Wallet {
    return loadBotWallet().connect(getProvider());
}

/** Reads the bot wallet's real on-chain USDC balance. */
export async function getUsdcBalance(walletAddress: string): Promise<number> {
    const contract = new Contract(USDC_ADDRESS, ERC20_BALANCE_ABI, getProvider());
    const raw: bigint = await contract.balanceOf(walletAddress);
    return Number(formatUnits(raw, USDC_DECIMALS));
}

/** Reads the bot wallet's real on-chain balance of an arbitrary ERC-20 (GEOD, MYST, ...). */
export async function getTokenBalance(tokenAddress: string, decimals: number, walletAddress: string): Promise<number> {
    const contract = new Contract(tokenAddress, ERC20_BALANCE_ABI, getProvider());
    const raw: bigint = await contract.balanceOf(walletAddress);
    return Number(formatUnits(raw, decimals));
}

/**
 * Native POL balance — the gas float, separate from any traded asset here
 * (same as ETH on Base / BNB on BNB Chain). Neither of the older EVM
 * modules has an equivalent check today; this one does, since running out
 * of POL would silently stop both the sell swap and the buy-back order from
 * ever being placed.
 */
export async function getNativeBalance(walletAddress: string): Promise<number> {
    const raw = await getProvider().getBalance(walletAddress);
    return Number(formatUnits(raw, NATIVE_DECIMALS));
}

/** Reads symbol()/decimals() live from an ERC-20 contract — used when a token is first added, so the app never has to trust a hardcoded guess. */
export async function getTokenMeta(tokenAddress: string): Promise<{ symbol: string; decimals: number }> {
    const contract = new Contract(tokenAddress, ERC20_META_ABI, getProvider());
    const [symbol, decimals] = await Promise.all([
        contract.symbol() as Promise<string>,
        contract.decimals() as Promise<bigint | number>,
    ]);
    return { symbol, decimals: Number(decimals) };
}
