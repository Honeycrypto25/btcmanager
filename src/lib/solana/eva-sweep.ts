import "server-only";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddress,
} from "@solana/spl-token";
import { db } from "@/lib/db";
import { loadBotKeypair, getRpcUrl } from "./wallet";
import { EVA_DECIMALS, EVA_MINT } from "./constants";
import { notifySweep } from "@/lib/email/tx-notify";

export interface SweepResult {
    action: "sent" | "skipped" | "error";
    reason?: string;
    amountEva?: number;
}

/**
 * Reads the bot wallet's real on-chain EVA balance, in both human units
 * (for display/bookkeeping, matching getUsdcBalance in wallet.ts) and raw
 * atomic units (for the transfer itself, to avoid float rounding on a
 * 9-decimal token). {0, 0n} if there's no EVA token account yet, rather
 * than throwing.
 */
async function getEvaBalance(connection: Connection, owner: PublicKey): Promise<{ ui: number; raw: bigint }> {
    const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(EVA_MINT) });
    if (value.length === 0) return { ui: 0, raw: 0n };
    const info = value[0].account.data.parsed?.info?.tokenAmount;
    const ui = typeof info?.uiAmount === "number" ? info.uiAmount : 0;
    const raw = info?.amount ? BigInt(info.amount) : 0n;
    return { ui, raw };
}

/**
 * Sends whatever EVA sits above `sweepMinBalanceEva` in the bot's hot
 * wallet to SOLANA_SWEEP_DESTINATION — the SAME env var (and therefore the
 * same cold wallet) as the SOL sweep in sweep.ts, per the user's explicit
 * request to keep one destination for both tokens. Never stored in the
 * database — see the schema comment on EvaSettings.sweepEnabled.
 *
 * Unlike the SOL sweep this is an SPL-token transfer, not a native
 * lamports transfer: it reads/writes the associated token accounts (ATAs)
 * for EVA_MINT directly via @solana/spl-token, creating the destination's
 * ATA idempotently (paid for by the bot wallet) since the cold wallet may
 * not hold any EVA yet. Gas for the transaction itself is still paid in
 * SOL regardless of the EVA amount moved, which is why sweepMinBalanceEva
 * has no SOL-reserve equivalent and safely defaults to 0.
 *
 * Always reads the REAL on-chain balance rather than the app's own
 * evaRemaining bookkeeping, since that's the only number that can't drift
 * out of sync with reality. The amount sent is floored to 2 decimals
 * (never rounded up), so the wallet always keeps at least
 * sweepMinBalanceEva — usually a little more. Same monthly gate/`force`
 * override pattern as the SOL sweep — see sweep.ts for the full rationale.
 */
export async function runEvaSweepForUser(userId: string, force = false): Promise<SweepResult> {
    const settings = await db.evaSettings.findUnique({ where: { userId } });
    if (!settings) return { action: "skipped", reason: "no settings" };
    if (!settings.sweepEnabled && !force) return { action: "skipped", reason: "sweep disabled" };

    if (!force) {
        const now = new Date();
        // Same "2nd of the month, self-healing" gate as the SOL sweep.
        if (now.getUTCDate() < 2) {
            return { action: "skipped", reason: "not the 2nd of the month yet" };
        }
        if (settings.lastSweepAt) {
            const last = settings.lastSweepAt;
            if (last.getUTCFullYear() === now.getUTCFullYear() && last.getUTCMonth() === now.getUTCMonth()) {
                return { action: "skipped", reason: "already swept this month" };
            }
        }
    }

    const destinationRaw = process.env.SOLANA_SWEEP_DESTINATION;
    if (!destinationRaw) {
        const error = "SOLANA_SWEEP_DESTINATION is not set in Vercel env vars.";
        await db.evaSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    let destination: PublicKey;
    try {
        destination = new PublicKey(destinationRaw.trim());
    } catch {
        const error = "SOLANA_SWEEP_DESTINATION is not a valid Solana address.";
        await db.evaSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const keypair = loadBotKeypair();
    if (keypair.publicKey.toBase58() !== settings.walletAddress) {
        const error = "SOLANA_PRIVATE_KEY does not match the wallet address configured in settings — refusing to sweep.";
        await db.evaSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const mint = new PublicKey(EVA_MINT);
    const { ui: balanceEva, raw: balanceRaw } = await getEvaBalance(connection, keypair.publicKey);

    const minBalance = Number(settings.sweepMinBalanceEva);
    const excess = balanceEva - minBalance;
    // Floor to 2 decimals — never round up, so the wallet never dips below minBalance.
    const amountEva = Math.floor(excess * 100) / 100;

    if (amountEva <= 0) {
        // Nothing to send this month — not logged as an EvaSweep row (not
        // interesting history), but lastSweepAt still advances so the
        // monthly gate doesn't re-check on every cron run for the rest of
        // the month.
        await db.evaSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "skipped", lastSweepError: null },
        });
        return { action: "skipped", reason: `balance ${balanceEva.toFixed(4)} EVA is at or below the ${minBalance} EVA minimum` };
    }

    // Convert the (floored, human-unit) amount back to raw atomic units for
    // the transfer, capping at the actual raw balance in case of any float
    // drift between the ui/raw readings of the same account.
    const rawToSend = BigInt(Math.round(amountEva * 10 ** EVA_DECIMALS));
    const amountRaw = rawToSend > balanceRaw ? balanceRaw : rawToSend;

    try {
        const sourceAta = await getAssociatedTokenAddress(mint, keypair.publicKey);
        const destinationAta = await getAssociatedTokenAddress(mint, destination);

        const tx = new Transaction().add(
            // Idempotent: a no-op if the destination already has an EVA
            // token account, otherwise creates one — paid for by the bot
            // wallet, since the cold wallet may never have held EVA before.
            createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, destinationAta, destination, mint),
            createTransferCheckedInstruction(sourceAta, mint, destinationAta, keypair.publicKey, amountRaw, EVA_DECIMALS)
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair);

        const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });
        const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
        if (confirmation.value.err) {
            throw new Error(`Transfer failed on-chain: ${JSON.stringify(confirmation.value.err)} (${signature})`);
        }

        await db.$transaction([
            db.evaSweep.create({
                data: {
                    userId,
                    status: "SUCCESS",
                    balanceBeforeEva: balanceEva,
                    amountEva,
                    destination: destinationRaw.trim(),
                    txSignature: signature,
                    manual: force,
                },
            }),
            db.evaSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "ok", lastSweepError: null },
            }),
        ]);

        await notifySweep({
            chain: "Solana",
            tokenSymbol: "Eva",
            status: "SUCCESS",
            amount: amountEva,
            destination: destinationRaw.trim(),
            manual: force,
            txUrl: `https://solscan.io/tx/${signature}`,
        });

        return { action: "sent", amountEva };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.$transaction([
            db.evaSweep.create({
                data: {
                    userId,
                    status: "FAILED",
                    balanceBeforeEva: balanceEva,
                    amountEva: 0,
                    destination: destinationRaw.trim(),
                    errorMessage: message,
                    manual: force,
                },
            }),
            db.evaSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: message },
            }),
        ]);

        await notifySweep({
            chain: "Solana",
            tokenSymbol: "Eva",
            status: "FAILED",
            amount: balanceEva,
            destination: destinationRaw.trim(),
            manual: force,
            errorMessage: message,
        });

        return { action: "error", reason: message };
    }
}
