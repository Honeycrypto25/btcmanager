// Minimal SPL-token helpers on @solana/web3.js v3 — replaces the three @solana/spl-token functions the
// bot uses (that package is pinned to web3.js v1). Byte-for-byte the same instructions.
import { PublicKey, TransactionInstruction } from "@solana/web3.js-v3";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

/** The owner's associated token account for a mint (classic Token program). */
export async function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    const [ata] = await PublicKey.findProgramAddress([owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()], ASSOCIATED_TOKEN_PROGRAM_ID);
    return ata;
}

/** Creates the ATA if it doesn't exist; a no-op if it does. */
export function createAssociatedTokenAccountIdempotentInstruction(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: new Uint8Array([1]), // CreateIdempotent
    });
}

/** TransferChecked: moves `amountRaw` of `mint` (with its decimals verified on-chain). */
export function createTransferCheckedInstruction(source: PublicKey, mint: PublicKey, destination: PublicKey, owner: PublicKey, amountRaw: bigint, decimals: number): TransactionInstruction {
    const data = new Uint8Array(10);
    data[0] = 12; // TransferChecked
    new DataView(data.buffer).setBigUint64(1, amountRaw, true);
    data[9] = decimals;
    return new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
            { pubkey: source, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
        ],
        data,
    });
}
