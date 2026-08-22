import "server-only";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { USDC_MINT } from "./constants";

/**
 * Loads the bot's dedicated Solana keypair from SOLANA_PRIVATE_KEY (a
 * base58-encoded secret key, the same format `solana-keygen` and most
 * wallet "export private key" features produce).
 *
 * This must be a wallet created SPECIFICALLY for this bot, funded only
 * with what you're willing to trade automatically — never the main
 * wallet. The key lives only in this env var (set in Vercel Project
 * Settings → Environment Variables); it is never written to the database.
 */
export function loadBotKeypair(): Keypair {
    const raw = process.env.SOLANA_PRIVATE_KEY;
    if (!raw) {
        throw new Error(
            "SOLANA_PRIVATE_KEY is not set. Add it in Vercel env vars — a base58 secret key for a dedicated bot wallet."
        );
    }
    try {
        const secretKey = bs58.decode(raw.trim());
        return Keypair.fromSecretKey(secretKey);
    } catch {
        throw new Error("SOLANA_PRIVATE_KEY is not a valid base58-encoded Solana secret key.");
    }
}

export function getRpcUrl(): string {
    return process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}

/**
 * Reads the bot wallet's real on-chain USDC balance (the "fuel" for future
 * buys) — 0 if there's no USDC token account yet (nothing bought/received
 * into it so far) rather than throwing.
 */
export async function getUsdcBalance(walletAddress: string): Promise<number> {
    const connection = new Connection(getRpcUrl(), "confirmed");
    const owner = new PublicKey(walletAddress);
    const mint = new PublicKey(USDC_MINT);
    const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint });
    if (value.length === 0) return 0;
    const amount = value[0].account.data.parsed?.info?.tokenAmount?.uiAmount;
    return typeof amount === "number" ? amount : 0;
}
