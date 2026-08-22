import "server-only";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { db } from "@/lib/db";
import { loadBotKeypair, getRpcUrl } from "./wallet";
import { notifySweep } from "@/lib/email/tx-notify";

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface SweepResult {
    action: "sent" | "skipped" | "error";
    reason?: string;
    amountSol?: number;
}

/**
 * Sends whatever SOL sits above `sweepMinBalanceSol` in the bot's hot
 * wallet to SOLANA_SWEEP_DESTINATION (a Vercel env var, never stored in
 * the database — see the schema comment on SolanaSettings.sweepEnabled).
 *
 * Always reads the REAL on-chain balance rather than the app's own
 * solRemaining bookkeeping, since that's the only number that can't drift
 * out of sync with reality. The amount sent is floored to 2 decimals
 * (never rounded up), so the wallet always keeps at least
 * sweepMinBalanceSol — usually a little more.
 *
 * `force` skips the "already swept this calendar month" gate — used by
 * the manual "Trimite acum" test button. Every attempt (including
 * skips/errors from `force`-less calls that had nothing to send) is
 * logged as a SolanaSweep row for a complete audit trail, except pure
 * "not due yet" skips from the monthly gate, which aren't interesting
 * history and would just clutter it.
 */
export async function runSolanaSweepForUser(userId: string, force = false): Promise<SweepResult> {
    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings) return { action: "skipped", reason: "no settings" };
    if (!settings.sweepEnabled && !force) return { action: "skipped", reason: "sweep disabled" };

    if (!force) {
        const now = new Date();
        // Hardcoded to the 2nd of the month (UTC, matching the cron's own
        // schedule) rather than "whatever day the month first ticks over" —
        // >= 2 instead of === 2 as a self-healing catch-up: if the daily
        // cron happens to fail/skip exactly on the 2nd, it still fires on
        // the next successful run that month instead of waiting a full
        // extra month, but the "already swept this month" check below
        // still guarantees it never runs twice in the same month.
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
        await db.solanaSettings.update({
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
        await db.solanaSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const keypair = loadBotKeypair();
    if (keypair.publicKey.toBase58() !== settings.walletAddress) {
        const error = "SOLANA_PRIVATE_KEY does not match the wallet address configured in settings — refusing to sweep.";
        await db.solanaSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const balanceLamports = await connection.getBalance(keypair.publicKey, "confirmed");
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

    const minBalance = Number(settings.sweepMinBalanceSol);
    const excess = balanceSol - minBalance;
    // Floor to 2 decimals — never round up, so the wallet never dips below minBalance.
    const amountSol = Math.floor(excess * 100) / 100;

    if (amountSol <= 0) {
        // Nothing to send this month — not logged as a SolanaSweep row (not
        // interesting history), but lastSweepAt still advances so the
        // monthly gate doesn't re-check on every cron run for the rest of
        // the month.
        await db.solanaSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "skipped", lastSweepError: null },
        });
        return { action: "skipped", reason: `balance ${balanceSol.toFixed(4)} SOL is at or below the ${minBalance} SOL minimum` };
    }

    const lamportsToSend = Math.round(amountSol * LAMPORTS_PER_SOL);

    try {
        const tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: destination,
                lamports: lamportsToSend,
            })
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
            db.solanaSweep.create({
                data: {
                    userId,
                    status: "SUCCESS",
                    balanceBeforeSol: balanceSol,
                    amountSol,
                    destination: destinationRaw.trim(),
                    txSignature: signature,
                    manual: force,
                },
            }),
            db.solanaSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "ok", lastSweepError: null },
            }),
        ]);

        await notifySweep({
            chain: "Solana",
            tokenSymbol: "SOL",
            status: "SUCCESS",
            amount: amountSol,
            destination: destinationRaw.trim(),
            manual: force,
            txUrl: `https://solscan.io/tx/${signature}`,
        });

        return { action: "sent", amountSol };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.$transaction([
            db.solanaSweep.create({
                data: {
                    userId,
                    status: "FAILED",
                    balanceBeforeSol: balanceSol,
                    amountSol: 0,
                    destination: destinationRaw.trim(),
                    errorMessage: message,
                    manual: force,
                },
            }),
            db.solanaSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: message },
            }),
        ]);

        await notifySweep({
            chain: "Solana",
            tokenSymbol: "SOL",
            status: "FAILED",
            amount: balanceSol,
            destination: destinationRaw.trim(),
            manual: force,
            errorMessage: message,
        });

        return { action: "error", reason: message };
    }
}
