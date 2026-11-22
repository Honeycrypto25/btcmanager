import "server-only";
import { Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, type AddressLookupTableAccount } from "@solana/web3.js";
import { trackApiCall } from "@/lib/api-usage";
import { JUPITER_API_BASE, SOL_MINT } from "./constants";
import { fetchOwnerPositions } from "./jupiter-lend";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "./spl";
import { safeJson, sendRawAndConfirm } from "./tx";

/**
 * Deposits SOL as extra collateral into an existing Jupiter Lend borrow position.
 *
 * Jupiter lets ANYONE deposit into ANY position (and repay its debt); only the position's owner can withdraw or
 * borrow. So the bot wallet signs and pays, while the position stays owned by the cold wallet
 * (SOLANA_SWEEP_DESTINATION). Instructions come from Jupiter's `borrow/operate-instructions` API
 * (positionOwner = the cold wallet), and the transaction is ALWAYS simulated before it is sent.
 */

export interface SweepLendPosition {
    vaultId: number;
    id: number;
    label: string; // "SOL/USDC #10671"
    collateralSol: number;
    debtAmount: number;
    debtSymbol: string;
    ltv: number;
    url: string;
}

const isSol = (symbol: string) => /^w?sol$/i.test(symbol.trim());

/** The open SOL-collateral positions owned by `owner` (the cold wallet) — the ones a sweep may be deposited into. */
export async function listSweepLendPositions(owner: string): Promise<{ positions: SweepLendPosition[]; error: string | null }> {
    try {
        const all = await fetchOwnerPositions(owner);
        const positions = all
            .filter((p) => isSol(p.collateral.symbol))
            .map((p) => ({
                vaultId: p.vaultId,
                id: p.id,
                label: `${p.collateral.symbol}/${p.debt.symbol} #${p.id}`,
                collateralSol: p.collateral.amount,
                debtAmount: p.debt.amount,
                debtSymbol: p.debt.symbol,
                ltv: p.ltv,
                url: p.url,
            }));
        return { positions, error: null };
    } catch (err) {
        return { positions: [], error: err instanceof Error ? err.message : String(err) };
    }
}

interface OperateResponse {
    nftId?: number;
    instructions: { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }[];
    addressLookupTableAddresses?: string[];
}

async function fetchOperateInstructions(args: { signer: string; owner: string; vaultId: number; positionId: number; colAmount: string; debtAmount: string }): Promise<OperateResponse> {
    if (!process.env.JUPITER_API_KEY) throw new Error("JUPITER_API_KEY lipsește în Vercel.");
    const res = await fetch(`${JUPITER_API_BASE}/lend/v1/borrow/operate-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.JUPITER_API_KEY },
        body: JSON.stringify({
            vaultId: args.vaultId,
            positionId: args.positionId,
            signer: args.signer,
            positionOwner: args.owner,
            colAmount: args.colAmount,
            debtAmount: args.debtAmount,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
    });
    await trackApiCall("jupiter", "lend", res.status);
    if (!res.ok) throw new Error(`Jupiter Lend (operate-instructions) a răspuns ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as OperateResponse;
    if (!Array.isArray(json.instructions) || json.instructions.length === 0) throw new Error("Jupiter Lend nu a returnat instrucțiuni.");
    return json;
}

const toInstruction = (i: OperateResponse["instructions"][number]) =>
    new TransactionInstruction({
        programId: new PublicKey(i.programId),
        keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
        data: Buffer.from(i.data, "base64"),
    });

/** SPL-token SyncNative: makes a wrapped-SOL account's token balance match its lamports. */
function syncNative(account: PublicKey): TransactionInstruction {
    return new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys: [{ pubkey: account, isSigner: false, isWritable: true }], data: new Uint8Array([17]) });
}
/** SPL-token CloseAccount: returns the account's lamports (any wrapped-SOL left over) to `destination`. */
function closeAccount(account: PublicKey, destination: PublicKey, owner: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
            { pubkey: account, isSigner: false, isWritable: true },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
        ],
        data: new Uint8Array([9]),
    });
}

async function loadTables(connection: Connection, addresses: string[]): Promise<AddressLookupTableAccount[]> {
    const out: AddressLookupTableAccount[] = [];
    for (const a of addresses) {
        const { value } = await connection.getAddressLookupTable(new PublicKey(a));
        if (!value) throw new Error(`Tabelul de adrese ${a} nu a fost găsit.`);
        out.push(value);
    }
    return out;
}

export interface DepositSimulation {
    ok: boolean;
    error: string | null;
    unitsConsumed: number | null;
    /** "direct" = Jupiter's instructions as returned; "wrapped" = with the SOL wrapped into wSOL first (needed if the direct one fails). */
    variant: "direct" | "wrapped" | null;
    logs: string[];
}

export interface PreparedDeposit {
    raw: Uint8Array;
    lastValidBlockHeight: bigint;
    simulation: DepositSimulation;
}

async function buildAndSimulate(connection: Connection, keypair: Keypair, instructions: TransactionInstruction[], tables: AddressLookupTableAccount[], variant: "direct" | "wrapped") {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({ payerKey: keypair.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message(tables);
    const tx = new VersionedTransaction(message);
    await tx.sign([keypair]);
    const sim = await connection.simulateTransaction(tx, { sigVerify: true, commitment: "confirmed" });
    const err = sim.value.err;
    const logs = (sim.value.logs ?? []).slice(-12);
    const simulation: DepositSimulation = {
        ok: !err,
        error: err ? safeJson(err) : null,
        unitsConsumed: sim.value.unitsConsumed != null ? Number(sim.value.unitsConsumed) : null,
        variant,
        logs,
    };
    return { raw: tx.serialize(), lastValidBlockHeight, simulation };
}

/**
 * Builds the signed deposit transaction and simulates it (nothing is sent). Tries Jupiter's instructions as they
 * come; if that does not simulate cleanly (native SOL must be wrapped first), tries again with the SOL wrapped
 * into a wSOL account that is closed afterwards. If neither simulates, the error and logs are returned.
 */
export async function prepareLendDeposit(connection: Connection, keypair: Keypair, args: { owner: string; vaultId: number; positionId: number; lamports: bigint }): Promise<PreparedDeposit> {
    const signer = keypair.publicKey;
    const op = await fetchOperateInstructions({ signer: signer.toBase58(), owner: args.owner, vaultId: args.vaultId, positionId: args.positionId, colAmount: args.lamports.toString(), debtAmount: "0" });
    if (op.nftId != null && op.nftId !== args.positionId) throw new Error(`Jupiter a returnat poziția #${op.nftId}, nu #${args.positionId} — nu depun.`);
    const ixs = op.instructions.map(toInstruction);
    const tables = await loadTables(connection, op.addressLookupTableAddresses ?? []);

    const direct = await buildAndSimulate(connection, keypair, ixs, tables, "direct");
    if (direct.simulation.ok) return direct;

    const wsol = new PublicKey(SOL_MINT);
    const ata = await getAssociatedTokenAddress(wsol, signer);
    const wrapped = await buildAndSimulate(
        connection,
        keypair,
        [
            createAssociatedTokenAccountIdempotentInstruction(signer, ata, signer, wsol),
            SystemProgram.transfer({ fromPubkey: signer, toPubkey: ata, lamports: args.lamports }),
            syncNative(ata),
            ...ixs,
            closeAccount(ata, signer, signer),
        ],
        tables,
        "wrapped",
    );
    if (wrapped.simulation.ok) return wrapped;
    // Neither works: report the direct variant's error (the more informative one), with both attempts' logs.
    return {
        ...direct,
        simulation: { ...direct.simulation, logs: [...direct.simulation.logs, "--- cu SOL împachetat (wSOL) ---", ...wrapped.simulation.logs, `eroare: ${wrapped.simulation.error ?? "?"}`] },
    };
}

export async function sendPreparedDeposit(connection: Connection, prepared: PreparedDeposit, label = "Depunere în împrumut"): Promise<string> {
    return sendRawAndConfirm(connection, prepared.raw, prepared.lastValidBlockHeight, label);
}

/**
 * Builds the signed PAYBACK transaction (USDC from the bot wallet repays part of the position's debt) and simulates
 * it; nothing is sent. A negative debtAmount means "repay" in the operate API. Like deposits, repaying is open to
 * anyone — the position stays owned by the cold wallet, and the bot can add collateral or repay, never withdraw or borrow.
 */
export async function prepareLendRepay(connection: Connection, keypair: Keypair, args: { owner: string; vaultId: number; positionId: number; usdcUnits: bigint }): Promise<PreparedDeposit> {
    if (args.usdcUnits <= 0n) throw new Error("Suma de plată trebuie să fie pozitivă.");
    const op = await fetchOperateInstructions({ signer: keypair.publicKey.toBase58(), owner: args.owner, vaultId: args.vaultId, positionId: args.positionId, colAmount: "0", debtAmount: `-${args.usdcUnits.toString()}` });
    if (op.nftId != null && op.nftId !== args.positionId) throw new Error(`Jupiter a returnat poziția #${op.nftId}, nu #${args.positionId} — nu plătesc.`);
    const tables = await loadTables(connection, op.addressLookupTableAddresses ?? []);
    return buildAndSimulate(connection, keypair, op.instructions.map(toInstruction), tables, "direct");
}
