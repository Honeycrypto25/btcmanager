import "server-only";
// Test bench for the @solana/web3.js v1 -> v3 upgrade. Everything here runs on the NEW library
// (installed side by side as "@solana/web3.js-v3") and ONLY with the dedicated test wallet
// (SOLANA_TEST_PRIVATE_KEY). The live bot keeps using v1 and its own wallet, untouched.
import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js-v3";
import bs58 from "bs58";
import { JUPITER_API_BASE, MIN_TRIGGER_ORDER_USD, SOL_DECIMALS, SOL_MINT, USDC_DECIMALS, USDC_MINT } from "../constants";

export type TestNet = "devnet" | "mainnet";

export interface TestResult {
    ok: boolean;
    lines: string[];
}

const LAMPORTS = 1_000_000_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64ToBytes = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));
const bytesToB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function rpcUrl(net: TestNet): string {
    return net === "devnet" ? process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com" : process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}
const explorer = (sig: string, net: TestNet) => `https://solscan.io/tx/${sig}${net === "devnet" ? "?cluster=devnet" : ""}`;

/**
 * The dedicated TEST wallet. Refuses to run with the live bot's key, so a test can never
 * move the bot's funds even by a configuration mistake.
 */
export async function loadTestKeypair(): Promise<Keypair> {
    const raw = process.env.SOLANA_TEST_PRIVATE_KEY?.trim();
    if (!raw) throw new Error("SOLANA_TEST_PRIVATE_KEY lipsește. Adaugă în Vercel cheia (base58) a unui wallet NOU, folosit doar pentru teste.");
    if (process.env.SOLANA_PRIVATE_KEY && raw === process.env.SOLANA_PRIVATE_KEY.trim()) {
        throw new Error("SOLANA_TEST_PRIVATE_KEY este aceeași cu cheia botului (SOLANA_PRIVATE_KEY). Folosește un wallet separat pentru teste.");
    }
    let secret: Uint8Array;
    try {
        secret = bs58.decode(raw);
    } catch {
        throw new Error("SOLANA_TEST_PRIVATE_KEY nu este o cheie base58 validă.");
    }
    return Keypair.fromSecretKey(secret); // async in v3 (WebCrypto)
}

async function usdcBalance(connection: Connection, owner: PublicKey): Promise<number> {
    const res = await connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(USDC_MINT) });
    let total = 0;
    for (const acc of res.value) {
        const info = (acc.account.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number | null } } } }).parsed?.info;
        total += Number(info?.tokenAmount?.uiAmount ?? 0);
    }
    return total;
}

/** Sends a signed tx and re-broadcasts it until it confirms or its blockhash expires (same strategy as the live bot). */
async function sendAndConfirm(connection: Connection, raw: Uint8Array, lastValidBlockHeight: bigint): Promise<string> {
    const signature = await connection.sendRawTransaction(raw, { maxRetries: 0n, skipPreflight: true });
    for (;;) {
        const st = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null))?.value[0];
        if (st) {
            if (st.err) throw new Error(`Tranzacția a eșuat on-chain: ${JSON.stringify(st.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))} (${signature})`);
            if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return signature;
        }
        const height = await connection.getBlockHeight("confirmed").catch(() => 0n);
        if (BigInt(height) > lastValidBlockHeight) throw new Error(`Tranzacția nu a fost confirmată înainte să expire (${signature}).`);
        await connection.sendRawTransaction(raw, { maxRetries: 0n, skipPreflight: true }).catch(() => undefined);
        await sleep(2000);
    }
}

async function run(fn: (log: (s: string) => void) => Promise<void>): Promise<TestResult> {
    const lines: string[] = [];
    const t0 = Date.now();
    try {
        await fn((s) => lines.push(s));
        lines.push(`✓ Reușit în ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        return { ok: true, lines };
    } catch (err) {
        lines.push(`✗ ${err instanceof Error ? err.message : String(err)}`);
        return { ok: false, lines };
    }
}

// ---------------------------------------------------------------- tests

/** 1. No network, no funds: load the key, build + sign a transaction, verify the signature cryptographically. */
export function testSigning(): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        log(`Wallet de test: ${kp.publicKey.toBase58()}`);
        const msg = new TransactionMessage({
            payerKey: kp.publicKey,
            recentBlockhash: "11111111111111111111111111111111" as never, // placeholder — this tx is never sent
            instructions: [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: kp.publicKey, lamports: 1000n })],
        }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        await tx.sign([kp]);
        const sig = tx.signatures[0];
        if (!sig || sig.length !== 64 || sig.every((b) => b === 0)) throw new Error("Semnătura lipsește după sign().");
        const pub = await crypto.subtle.importKey("raw", new Uint8Array(kp.publicKey.toBytes()), { name: "Ed25519" }, false, ["verify"]);
        const valid = await crypto.subtle.verify({ name: "Ed25519" }, pub, new Uint8Array(sig), new Uint8Array(msg.serialize()));
        if (!valid) throw new Error("Semnătura NU se verifică față de cheia publică.");
        log("Tranzacție construită, semnată și semnătura verificată criptografic (Ed25519).");
        const round = VersionedTransaction.deserialize(tx.serialize());
        if (bs58.encode(round.signatures[0]) !== bs58.encode(sig)) throw new Error("Serializare/deserializare: semnătura diferă.");
        log(`Serializare → deserializare OK (${tx.serialize().length} bytes).`);
    });
}

/** 2. Balances of the test wallet on the chosen network. */
export function testBalances(net: TestNet): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl(net), "confirmed");
        log(`Rețea: ${net} · wallet ${kp.publicKey.toBase58()}`);
        const lamports = await connection.getBalance(kp.publicKey);
        log(`SOL: ${(Number(lamports) / LAMPORTS).toFixed(6)}`);
        if (net === "mainnet") log(`USDC: ${(await usdcBalance(connection, kp.publicKey)).toFixed(4)}`);
        const height = await connection.getBlockHeight("confirmed");
        log(`Block height: ${height.toString()}`);
    });
}

/** 3. Devnet only: ask the public faucet for 1 SOL (the faucet is often rate-limited). */
export function testAirdrop(): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl("devnet"), "confirmed");
        const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS);
        log(`Airdrop cerut: ${explorer(sig, "devnet")}`);
        for (let i = 0; i < 20; i++) {
            const st = (await connection.getSignatureStatuses([sig])).value[0];
            if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") break;
            await sleep(1500);
        }
        log(`SOL acum: ${(Number(await connection.getBalance(kp.publicKey)) / LAMPORTS).toFixed(6)}`);
    });
}

/** 4. Real transaction: sends 0.001 SOL from the test wallet to itself (only the network fee is spent). */
export function testTransfer(net: TestNet): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl(net), "confirmed");
        const before = await connection.getBalance(kp.publicKey);
        log(`Rețea: ${net} · sold înainte ${(Number(before) / LAMPORTS).toFixed(6)} SOL`);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const msg = new TransactionMessage({
            payerKey: kp.publicKey,
            recentBlockhash: blockhash,
            instructions: [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: kp.publicKey, lamports: 1_000_000n })],
        }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        await tx.sign([kp]);
        const sig = await sendAndConfirm(connection, tx.serialize(), lastValidBlockHeight);
        log(`Confirmat: ${explorer(sig, net)}`);
        const after = await connection.getBalance(kp.publicKey);
        log(`Sold după ${(Number(after) / LAMPORTS).toFixed(6)} SOL (taxă ${(Number(before - after) / LAMPORTS).toFixed(6)} SOL)`);
    });
}

// ---------------------------------------------------------------- Jupiter (mainnet only)

async function jup<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
    const res = await fetch(`${JUPITER_API_BASE}${path}`, { ...init, headers, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new Error(`Jupiter ${path.split("?")[0]} → ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
}

async function solPrice(): Promise<number> {
    const r = await jup<Record<string, { usdPrice?: number }>>(`/price/v3?ids=${SOL_MINT}`);
    const p = r[SOL_MINT]?.usdPrice;
    if (!p) throw new Error("Nu am putut citi prețul SOL de la Jupiter.");
    return p;
}

/** 5. Mainnet: swap $1 USDC -> SOL through Jupiter, signed with v3. */
export function testSwap(amountUsd = 1): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl("mainnet"), "confirmed");
        const usdc = await usdcBalance(connection, kp.publicKey);
        if (usdc < amountUsd) throw new Error(`Walletul de test are ${usdc.toFixed(2)} USDC; trebuie cel puțin $${amountUsd}.`);
        const raw = Math.round(amountUsd * 10 ** USDC_DECIMALS);
        const quote = await jup<{ outAmount: string }>(`/swap/v1/quote?inputMint=${USDC_MINT}&outputMint=${SOL_MINT}&amount=${raw}&slippageBps=100`);
        log(`Cotație: $${amountUsd} USDC → ${(Number(quote.outAmount) / 10 ** SOL_DECIMALS).toFixed(6)} SOL`);
        const { swapTransaction, lastValidBlockHeight } = await jup<{ swapTransaction: string; lastValidBlockHeight?: number }>(`/swap/v1/swap`, {
            method: "POST",
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: kp.publicKey.toBase58(),
                dynamicComputeUnitLimit: true,
                dynamicSlippage: true,
                prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: "veryHigh" } },
            }),
        });
        const tx = VersionedTransaction.deserialize(b64ToBytes(swapTransaction));
        await tx.sign([kp]);
        const last = lastValidBlockHeight !== undefined ? BigInt(lastValidBlockHeight) : BigInt(await connection.getBlockHeight("confirmed")) + 150n;
        const sig = await sendAndConfirm(connection, tx.serialize(), last);
        log(`Swap confirmat: ${explorer(sig, "mainnet")}`);
    });
}

/**
 * 6. Mainnet: place a limit BUY (USDC -> SOL) far below the market so it can't fill, then cancel it.
 * Jupiter escrows the USDC on create and returns it on cancel — only network fees are spent.
 */
export function testLimitOrder(): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const owner = kp.publicKey.toBase58();
        const connection = new Connection(rpcUrl("mainnet"), "confirmed");
        const amountUsd = MIN_TRIGGER_ORDER_USD;
        const usdc = await usdcBalance(connection, kp.publicKey);
        if (usdc < amountUsd) throw new Error(`Walletul de test are ${usdc.toFixed(2)} USDC; ordinul limit minim e $${amountUsd} (se întorc la anulare).`);
        const price = await solPrice();
        const limit = price * 0.5;
        log(`Preț SOL $${price.toFixed(2)} → ordin limit de cumpărare $${amountUsd} la $${limit.toFixed(2)} (−50%, nu se poate executa)`);

        const signAndExecute = async (transaction: string, requestId: string) => {
            const tx = VersionedTransaction.deserialize(b64ToBytes(transaction));
            await tx.sign([kp]);
            const r = await jup<{ signature: string; status: string; error?: string }>(`/trigger/v1/execute`, {
                method: "POST",
                body: JSON.stringify({ signedTransaction: bytesToB64(tx.serialize()), requestId }),
            });
            if (r.status !== "Success") throw new Error(`Jupiter execute: ${r.error ?? r.status}`);
            return r.signature;
        };

        const created = await jup<{ order: string; transaction: string; requestId: string }>(`/trigger/v1/createOrder`, {
            method: "POST",
            body: JSON.stringify({
                inputMint: USDC_MINT,
                outputMint: SOL_MINT,
                maker: owner,
                payer: owner,
                params: {
                    makingAmount: String(Math.round(amountUsd * 10 ** USDC_DECIMALS)),
                    takingAmount: String(Math.round((amountUsd / limit) * 10 ** SOL_DECIMALS)),
                },
                computeUnitPrice: "auto",
            }),
        });
        const placeSig = await signAndExecute(created.transaction, created.requestId);
        log(`Ordin plasat (${created.order}): ${explorer(placeSig, "mainnet")}`);

        try {
            await sleep(3000);
            const crafted = await jup<{ transaction: string; requestId: string }>(`/trigger/v1/cancelOrder`, {
                method: "POST",
                body: JSON.stringify({ maker: owner, order: created.order, computeUnitPrice: "auto" }),
            });
            const cancelSig = await signAndExecute(crafted.transaction, crafted.requestId);
            log(`Ordin anulat, USDC returnați: ${explorer(cancelSig, "mainnet")}`);
        } catch (err) {
            throw new Error(`Ordinul ${created.order} a fost PLASAT, dar anularea a eșuat: ${err instanceof Error ? err.message : String(err)}. Anulează-l manual pe jup.ag (cu walletul de test).`);
        }
    });
}

/** Whether the test wallet is configured, and its address (never the key). */
export async function testWalletInfo(): Promise<{ configured: boolean; address: string | null; error: string | null }> {
    if (!process.env.SOLANA_TEST_PRIVATE_KEY) return { configured: false, address: null, error: null };
    try {
        return { configured: true, address: (await loadTestKeypair()).publicKey.toBase58(), error: null };
    } catch (err) {
        return { configured: false, address: null, error: err instanceof Error ? err.message : String(err) };
    }
}
