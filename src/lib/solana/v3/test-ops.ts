import "server-only";
// Test bench for the @solana/web3.js v1 -> v3 upgrade. Everything here runs on the NEW library
// (installed side by side as "@solana/web3.js-v3") and ONLY with the dedicated test wallet
// (SOLANA_TEST_PRIVATE_KEY). The live bot keeps using v1 and its own wallet, untouched.
import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js-v3";
import bs58 from "bs58";
import { createPrivateKey, sign as ed25519Sign } from "node:crypto";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddress } from "./spl";
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

/** Reads back the network fee actually paid (RPC replicas can lag, so retry briefly) — the bot records this per trade. */
async function readFeeLamports(connection: Connection, signature: string): Promise<bigint | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const info = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
        if (info?.meta) return BigInt(info.meta.fee);
        if (attempt < 4) await sleep(500 * (attempt + 1));
    }
    return null;
}
const feeLine = (fee: bigint | null) => (fee === null ? "Taxa nu a putut fi citită din tranzacție (RPC întârziat)." : `Taxă citită din tranzacție: ${fee.toString()} lamports (${(Number(fee) / LAMPORTS).toFixed(6)} SOL)`);

/** v3 errors come as "Solana error #N; Decode this error by running ... '<base64 context>'" — unpack the context so the cause is readable. */
function readableError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    const m = msg.match(/Solana error #(\d+);[\s\S]*?'([A-Za-z0-9+/=]+)'/);
    if (!m) return msg;
    try {
        const ctx = new URLSearchParams(Buffer.from(m[2], "base64").toString("utf8"));
        const parts = [ctx.get("statusCode") ? `HTTP ${ctx.get("statusCode")}` : null, ctx.get("message")].filter(Boolean);
        const extra = [...ctx.entries()].filter(([k]) => !["__code", "headers", "statusCode", "message"].includes(k)).map(([k, v]) => `${k}=${v}`);
        return `Eroare Solana #${m[1]}: ${[...parts, ...extra].join(" · ") || "fără detalii"}`;
    } catch {
        return msg;
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
        lines.push(`✗ ${readableError(err)}`);
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
        log(feeLine(await readFeeLamports(connection, sig)));
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
        log(feeLine(await readFeeLamports(connection, sig)));
    });
}

/** Places a Jupiter Trigger V1 order and cancels it right away (same calls the bot uses for buy and sell orders). */
async function placeAndCancel(kp: Keypair, log: (s: string) => void, order: { inputMint: string; outputMint: string; makingAmount: string; takingAmount: string }) {
    const owner = kp.publicKey.toBase58();
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
            inputMint: order.inputMint,
            outputMint: order.outputMint,
            maker: owner,
            payer: owner,
            params: { makingAmount: order.makingAmount, takingAmount: order.takingAmount },
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
        log(`Ordin anulat, fondurile returnate: ${explorer(cancelSig, "mainnet")}`);
    } catch (err) {
        throw new Error(`Ordinul ${created.order} a fost PLASAT, dar anularea a eșuat: ${err instanceof Error ? err.message : String(err)}. Anulează-l manual pe jup.ag (cu walletul de test).`);
    }
}

/**
 * 8. Mainnet: place a limit BUY (USDC -> SOL) far below the market so it can't fill, then cancel it.
 * Jupiter escrows the USDC on create and returns it on cancel — only network fees are spent.
 */
export function testLimitOrder(): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl("mainnet"), "confirmed");
        const amountUsd = MIN_TRIGGER_ORDER_USD;
        const usdc = await usdcBalance(connection, kp.publicKey);
        if (usdc < amountUsd) throw new Error(`Walletul de test are ${usdc.toFixed(2)} USDC; ordinul limit minim e $${amountUsd} (se întorc la anulare).`);
        const price = await solPrice();
        const limit = price * 0.5;
        log(`Preț SOL $${price.toFixed(2)} → ordin limit de cumpărare $${amountUsd} la $${limit.toFixed(2)} (−50%, nu se poate executa)`);
        await placeAndCancel(kp, log, {
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            makingAmount: String(Math.round(amountUsd * 10 ** USDC_DECIMALS)),
            takingAmount: String(Math.round((amountUsd / limit) * 10 ** SOL_DECIMALS)),
        });
    });
}

/**
 * 9. Mainnet: place a take-profit SELL (SOL -> USDC) at double the market price, then cancel it —
 * the order the bot places after every buy. Needs ~$5.5 of SOL in the test wallet.
 */
export function testSellOrder(): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl("mainnet"), "confirmed");
        const price = await solPrice();
        const sellUsd = MIN_TRIGGER_ORDER_USD * 1.04; // small margin over Jupiter's $5 minimum
        const solToSell = sellUsd / price;
        const sol = Number(await connection.getBalance(kp.publicKey)) / LAMPORTS;
        const needed = solToSell + 0.006; // + fees and temporary account rent
        if (sol < needed) throw new Error(`Walletul de test are ${sol.toFixed(4)} SOL; pentru ordinul de vânzare de $${sellUsd.toFixed(2)} trebuie ~${needed.toFixed(4)} SOL (se întorc la anulare). Mai trimite ~${(needed - sol).toFixed(4)} SOL.`);
        const target = price * 2;
        log(`Preț SOL $${price.toFixed(2)} → ordin de vânzare ${solToSell.toFixed(4)} SOL la $${target.toFixed(2)} (+100%, nu se poate executa)`);
        await placeAndCancel(kp, log, {
            inputMint: SOL_MINT,
            outputMint: USDC_MINT,
            makingAmount: String(Math.round(solToSell * 10 ** SOL_DECIMALS)),
            takingAmount: String(Math.round(solToSell * target * 10 ** USDC_DECIMALS)),
        });
    });
}

/** 10. Mainnet: swap $1 USDC -> SOL through Jupiter ULTRA (the API the EVA bot buys with). */
export function testUltraSwap(amountUsd = 1): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl("mainnet"), "confirmed");
        const usdc = await usdcBalance(connection, kp.publicKey);
        if (usdc < amountUsd) throw new Error(`Walletul de test are ${usdc.toFixed(2)} USDC; trebuie cel puțin $${amountUsd}.`);
        const qs = new URLSearchParams({ inputMint: USDC_MINT, outputMint: SOL_MINT, amount: String(Math.round(amountUsd * 10 ** USDC_DECIMALS)), taker: kp.publicKey.toBase58() });
        const res = await fetch(`https://lite-api.jup.ag/ultra/v1/order?${qs.toString()}`, { cache: "no-store" });
        const order = (await res.json()) as { transaction?: string | null; requestId: string; outAmount?: string; error?: string };
        if (!res.ok || !order.transaction) throw new Error(`Jupiter Ultra nu a întors o tranzacție: ${order.error ?? res.status}`);
        log(`Ordin Ultra: $${amountUsd} USDC → ~${(Number(order.outAmount ?? 0) / 10 ** SOL_DECIMALS).toFixed(6)} SOL`);
        const tx = VersionedTransaction.deserialize(b64ToBytes(order.transaction));
        await tx.sign([kp]);
        const exec = await fetch(`https://lite-api.jup.ag/ultra/v1/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signedTransaction: bytesToB64(tx.serialize()), requestId: order.requestId }),
            cache: "no-store",
        });
        const executed = (await exec.json()) as { status?: string; signature?: string; error?: string; code?: number; outputAmountResult?: string };
        if (executed.status !== "Success" || !executed.signature) throw new Error(`Swap-ul Ultra a eșuat: ${executed.error ?? "eroare necunoscută"} (cod ${executed.code ?? "?"})`);
        log(`Swap Ultra confirmat: ${explorer(executed.signature, "mainnet")}`);
        if (executed.outputAmountResult) log(`Primit efectiv: ${(Number(executed.outputAmountResult) / 10 ** SOL_DECIMALS).toFixed(6)} SOL`);
        log(feeLine(await readFeeLamports(connection, executed.signature)));
    });
}

/** 11. Mainnet: SPL token transfer — 0.01 USDC from the test wallet's token account to itself (the EVA sweep's instructions). */
export function testTokenTransfer(): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const connection = new Connection(rpcUrl("mainnet"), "confirmed");
        const mint = new PublicKey(USDC_MINT);
        const ata = await getAssociatedTokenAddress(mint, kp.publicKey);
        log(`Cont de token USDC: ${ata.toBase58()}`);
        const before = await usdcBalance(connection, kp.publicKey);
        if (before < 0.01) throw new Error(`Walletul de test are ${before.toFixed(4)} USDC; trebuie cel puțin 0.01.`);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const msg = new TransactionMessage({
            payerKey: kp.publicKey,
            recentBlockhash: blockhash,
            instructions: [
                createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, ata, kp.publicKey, mint), // no-op: the account exists
                createTransferCheckedInstruction(ata, mint, ata, kp.publicKey, 10_000n, USDC_DECIMALS),
            ],
        }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        await tx.sign([kp]);
        const sig = await sendAndConfirm(connection, tx.serialize(), lastValidBlockHeight);
        log(`Transfer de token confirmat: ${explorer(sig, "mainnet")}`);
        log(feeLine(await readFeeLamports(connection, sig)));
        const after = await usdcBalance(connection, kp.publicKey);
        log(`USDC înainte ${before.toFixed(4)} · după ${after.toFixed(4)} (neschimbat: transfer către același cont)`);
    });
}

/**
 * 12. Mainnet, moves nothing: signs Jupiter Trigger V2's login challenge with the v3 keypair and gets the
 * session token — the authentication the EVA bot's V2 orders depend on.
 */
export function testMessageSigning(): Promise<TestResult> {
    return run(async (log) => {
        const kp = await loadTestKeypair();
        const sign = (message: string) => {
            const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(kp.secretKey.slice(0, 32))]);
            return new Uint8Array(ed25519Sign(null, Buffer.from(message, "utf8"), createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" })));
        };
        const probe = "evama test message";
        const pub = await crypto.subtle.importKey("raw", new Uint8Array(kp.publicKey.toBytes()), { name: "Ed25519" }, false, ["verify"]);
        if (!(await crypto.subtle.verify({ name: "Ed25519" }, pub, sign(probe), new TextEncoder().encode(probe)))) throw new Error("Semnătura mesajului NU se verifică.");
        log("Mesaj semnat cu cheia v3 și semnătura verificată local.");

        const apiKey = process.env.JUPITER_API_KEY;
        if (!apiKey) {
            log("JUPITER_API_KEY lipsește, deci autentificarea reală la Trigger V2 a fost sărită.");
            return;
        }
        const v2 = async <T>(path: string, body: unknown): Promise<T> => {
            const res = await fetch(`${JUPITER_API_BASE}/trigger/v2${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey }, body: JSON.stringify(body), cache: "no-store" });
            const text = await res.text();
            if (!res.ok) throw new Error(`Jupiter Trigger V2 ${path} → ${res.status}: ${text.slice(0, 200)}`);
            return JSON.parse(text) as T;
        };
        const walletPubkey = kp.publicKey.toBase58();
        const { challenge } = await v2<{ challenge: string }>("/auth/challenge", { walletPubkey, type: "message" });
        const signature = bs58.encode(sign(challenge));
        let verified: { token?: string };
        try {
            verified = await v2<{ token?: string }>("/auth/verify", { type: "message", walletPubkey, signature });
        } catch {
            verified = await v2<{ token?: string }>("/auth/verify", { type: "message", walletPubkey, challenge, signature });
        }
        if (!verified.token) throw new Error("Trigger V2: autentificarea nu a întors un token.");
        log(`Autentificare Jupiter Trigger V2 reușită (token de ${verified.token.length} caractere, nu e afișat).`);
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
