import "server-only";
import { Connection, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** JSON.stringify that tolerates the bigint values web3.js v3 returns (slots, fees, error payloads). */
export function safeJson(value: unknown): string {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Thrown when a transaction's blockhash expired without it landing — nothing happened on-chain, safe to retry. */
export class TransactionExpiredError extends Error {
    constructor(public signature: string) {
        super(`Transaction expired before it was confirmed (${signature})`);
        this.name = "TransactionExpiredError";
    }
}

/**
 * Sends an already-signed transaction and re-broadcasts it every ~2s until it confirms or its
 * blockhash expires (a single send is easily dropped under congestion). Throws on an on-chain
 * failure, and TransactionExpiredError only when it definitively never landed.
 */
export async function sendRawAndConfirm(connection: Connection, raw: Uint8Array, lastValidBlockHeight: bigint, label = "Transaction"): Promise<string> {
    const signature = await connection.sendRawTransaction(raw, { maxRetries: 0n, skipPreflight: true });
    const statusOf = async () => (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    const landedOk = (st: Awaited<ReturnType<typeof statusOf>>) => {
        if (!st) return false;
        if (st.err) throw new Error(`${label} failed on-chain: ${safeJson(st.err)} (${signature})`);
        return st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized";
    };

    for (;;) {
        // An on-chain failure must propagate; only RPC hiccups are swallowed.
        let st: Awaited<ReturnType<typeof statusOf>> = null;
        try {
            st = await statusOf();
        } catch {
            st = null;
        }
        if (landedOk(st)) return signature;
        const height = await connection.getBlockHeight("confirmed").catch(() => 0n);
        if (BigInt(height) > lastValidBlockHeight) break;
        await connection.sendRawTransaction(raw, { maxRetries: 0n, skipPreflight: true }).catch(() => undefined);
        await sleep(2000);
    }

    // Final check after expiry: it may have landed in the last moments.
    await sleep(2000);
    let last: Awaited<ReturnType<typeof statusOf>> = null;
    try {
        last = await statusOf();
    } catch {
        last = null;
    }
    if (landedOk(last)) return signature;
    throw new TransactionExpiredError(signature);
}

/** Builds a v0 transaction from instructions, signs it with the keypair, sends and confirms it. */
export async function signSendAndConfirm(connection: Connection, keypair: Keypair, instructions: TransactionInstruction[], label = "Transaction"): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({ payerKey: keypair.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    await tx.sign([keypair]);
    return sendRawAndConfirm(connection, tx.serialize(), lastValidBlockHeight, label);
}

/** Network fee actually paid by a confirmed transaction, in lamports (0 if the RPC never returned it). */
export async function readFeeLamports(connection: Connection, signature: string): Promise<number> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const info = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
        if (info?.meta) return Number(info.meta.fee);
        if (attempt < 4) await sleep(500 * (attempt + 1));
    }
    return 0;
}
