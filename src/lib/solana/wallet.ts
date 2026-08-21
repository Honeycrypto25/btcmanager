import "server-only";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

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
