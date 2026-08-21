import "server-only";
import { JsonRpcProvider, Wallet } from "ethers";
import { getRpcUrl } from "./constants";

/**
 * Loads the bot's dedicated EVM wallet from BASE_PRIVATE_KEY (a standard
 * 0x-prefixed hex private key, the same format MetaMask/Phantom "export
 * private key" produces).
 *
 * This must be a wallet created SPECIFICALLY for this bot, funded only
 * with what you're willing to trade automatically — never the main
 * wallet. The key lives only in this env var (set in Vercel Project
 * Settings → Environment Variables); it is never written to the database.
 */
export function loadBotWallet(): Wallet {
    const raw = process.env.BASE_PRIVATE_KEY;
    if (!raw) {
        throw new Error(
            "BASE_PRIVATE_KEY is not set. Add it in Vercel env vars — a 0x-prefixed private key for a dedicated bot wallet."
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
