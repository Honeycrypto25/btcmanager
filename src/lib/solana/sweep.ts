import "server-only";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { signSendAndConfirm } from "./tx";
import { db } from "@/lib/db";
import { priceForSweep } from "@/lib/sweep-price";
import { getSolPriceUsd } from "./jupiter";
import { loadBotKeypair, getRpcUrl } from "./wallet";
import { notifySweep } from "@/lib/email/tx-notify";
import { listSweepLendPositions, prepareLendDeposit, sendPreparedDeposit, type DepositSimulation } from "./lend-deposit";

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface SweepResult {
    action: "sent" | "skipped" | "error" | "simulated";
    reason?: string;
    amountSol?: number;
    /** Only for a simulation (dryRun) of a deposit into a Jupiter Lend position. */
    simulation?: DepositSimulation;
}

export interface SweepOptions {
    /** Lend target only: build + simulate the deposit and report, without sending anything or writing anything. */
    dryRun?: boolean;
    /** Manual runs only: send this much SOL instead of the whole excess (never more than the excess). */
    amountSol?: number;
    /** Retry of a failed lend sweep (skips the monthly gate; the caller has already claimed the retry). */
    retry?: boolean;
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
export async function runSolanaSweepForUser(userId: string, force = false, opts: SweepOptions = {}): Promise<SweepResult> {
    const settings = await db.solanaSettings.findUnique({ where: { userId } });
    if (!settings) return { action: "skipped", reason: "no settings" };
    if (!settings.sweepEnabled && !force) return { action: "skipped", reason: "sweep disabled" };
    const lend = settings.sweepTarget === "lend";
    if (opts.dryRun && !lend) return { action: "skipped", reason: "Simularea există doar pentru depunerea în împrumut (ținta e setată pe cold wallet)." };
    const quiet = !!opts.dryRun; // a simulation never writes to the database nor sends an email

    if (!force && !opts.retry) {
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
        if (!quiet) await db.solanaSettings.update({ where: { userId }, data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error } });
        return { action: "error", reason: error };
    }

    let destination: PublicKey;
    try {
        destination = new PublicKey(destinationRaw.trim());
    } catch {
        const error = "SOLANA_SWEEP_DESTINATION is not a valid Solana address.";
        if (!quiet) await db.solanaSettings.update({ where: { userId }, data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error } });
        return { action: "error", reason: error };
    }

    const keypair = await loadBotKeypair();
    if (keypair.publicKey.toBase58() !== settings.walletAddress) {
        const error = "SOLANA_PRIVATE_KEY does not match the wallet address configured in settings — refusing to sweep.";
        if (!quiet) await db.solanaSettings.update({ where: { userId }, data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error } });
        return { action: "error", reason: error };
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const balanceLamports = await connection.getBalance(keypair.publicKey, "confirmed");
    const balanceSol = Number(balanceLamports) / LAMPORTS_PER_SOL;

    const minBalance = Number(settings.sweepMinBalanceSol);
    const excess = balanceSol - minBalance;
    // Floor to 2 decimals — never round up, so the wallet never dips below minBalance.
    const excessFloored = Math.floor(excess * 100) / 100;
    let amountSol = excessFloored;
    if (opts.amountSol !== undefined) {
        // Manual test amount (e.g. the smallest deposit possible): 3 decimals, and never more than what is above the minimum.
        const wanted = Math.floor(opts.amountSol * 1000) / 1000;
        if (!(wanted > 0)) return { action: "error", reason: "Suma de test trebuie să fie pozitivă." };
        if (wanted > Math.floor(excess * 1000) / 1000) {
            return { action: "error", reason: `Suma de test (${wanted} SOL) depășește ce e peste minimul păstrat (${Math.max(0, Math.floor(excess * 1000) / 1000)} SOL).` };
        }
        amountSol = wanted;
    }

    if (amountSol <= 0) {
        // Nothing to send this month — not logged as a SolanaSweep row (not
        // interesting history), but lastSweepAt still advances so the
        // monthly gate doesn't re-check on every cron run for the rest of
        // the month.
        if (!quiet) {
            await db.solanaSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "skipped", lastSweepError: null, ...(opts.retry ? { sweepRetryPending: false } : {}) },
            });
        }
        return { action: "skipped", reason: `balance ${balanceSol.toFixed(4)} SOL is at or below the ${minBalance} SOL minimum` };
    }

    const lamportsToSend = Math.round(amountSol * LAMPORTS_PER_SOL);

    if (lend) {
        return runLendSweep({ userId, settings, keypair, connection, owner: destinationRaw.trim(), balanceSol, amountSol, lamportsToSend, manual: force, retry: !!opts.retry, dryRun: quiet });
    }

    try {
        const signature = await signSendAndConfirm(
            connection,
            keypair,
            [SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: destination, lamports: BigInt(lamportsToSend) })],
            "Transfer"
        );

        const priceUsd = await priceForSweep(getSolPriceUsd);
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
                    priceUsd,
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


type SettingsRow = NonNullable<Awaited<ReturnType<typeof db.solanaSettings.findUnique>>>;

/**
 * The "lend" target: the same SOL a cold-wallet sweep would send is deposited as extra collateral into the chosen
 * Jupiter Lend position (owned by SOLANA_SWEEP_DESTINATION; only deposits are possible for a non-owner, so the bot
 * wallet can never withdraw or borrow from it). The position is re-checked against the owner wallet every time,
 * and the transaction is simulated first — a simulation failure sends nothing. A failed attempt keeps the SOL in
 * the bot wallet and marks the sweep as pending a retry (next time the Solana page is opened, ≤ every 6 hours).
 */
async function runLendSweep(a: {
    userId: string;
    settings: SettingsRow;
    keypair: Awaited<ReturnType<typeof loadBotKeypair>>;
    connection: Connection;
    owner: string;
    balanceSol: number;
    amountSol: number;
    lamportsToSend: number;
    manual: boolean;
    retry: boolean;
    dryRun: boolean;
}): Promise<SweepResult> {
    const { userId, settings, keypair, connection, owner, balanceSol, amountSol, lamportsToSend, manual, dryRun } = a;
    const vaultId = settings.sweepLendVaultId;
    const positionId = settings.sweepLendPositionId;
    const destinationLabel = positionId != null ? `Împrumut Jupiter Lend #${positionId}` : "Împrumut Jupiter Lend";

    const fail = async (message: string): Promise<SweepResult> => {
        if (dryRun) return { action: "error", reason: message };
        await db.$transaction([
            db.solanaSweep.create({
                data: { userId, status: "FAILED", balanceBeforeSol: balanceSol, amountSol: 0, destination: owner, errorMessage: message, manual, target: "lend", lendVaultId: vaultId, lendPositionId: positionId },
            }),
            db.solanaSettings.update({ where: { userId }, data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: message, sweepRetryPending: true } }),
        ]);
        await notifySweep({ chain: "Solana", tokenSymbol: "SOL", status: "FAILED", amount: amountSol, destination: owner, destinationLabel, manual, errorMessage: `${message} SOL-ul rămâne în botul tău; se reîncearcă la următoarea deschidere a paginii Solana.` });
        return { action: "error", reason: message };
    };

    if (vaultId == null || positionId == null) return fail("Nu e aleasă poziția de împrumut în setări.");

    try {
        const { positions, error } = await listSweepLendPositions(owner);
        if (error) return fail(`Nu pot citi pozițiile de împrumut: ${error}`);
        if (!positions.some((p) => p.id === positionId && p.vaultId === vaultId)) {
            return fail(`Poziția #${positionId} nu mai e deschisă pe walletul de destinație sau nu are SOL drept colateral.`);
        }

        const prepared = await prepareLendDeposit(connection, keypair, { owner, vaultId, positionId, lamports: BigInt(lamportsToSend) });
        if (dryRun) {
            return prepared.simulation.ok
                ? { action: "simulated", amountSol, simulation: prepared.simulation }
                : { action: "error", reason: `Simularea a eșuat: ${prepared.simulation.error}`, amountSol, simulation: prepared.simulation };
        }
        if (!prepared.simulation.ok) return fail(`Simularea depunerii a eșuat (nu s-a trimis nimic): ${prepared.simulation.error}`);

        const signature = await sendPreparedDeposit(connection, prepared);
        const priceUsd = await priceForSweep(getSolPriceUsd);
        await db.$transaction([
            db.solanaSweep.create({
                data: { userId, status: "SUCCESS", balanceBeforeSol: balanceSol, amountSol, destination: owner, txSignature: signature, manual, priceUsd, target: "lend", lendVaultId: vaultId, lendPositionId: positionId },
            }),
            db.solanaSettings.update({ where: { userId }, data: { lastSweepAt: new Date(), lastSweepStatus: "ok", lastSweepError: null, sweepRetryPending: false } }),
        ]);
        await notifySweep({ chain: "Solana", tokenSymbol: "SOL", status: "SUCCESS", amount: amountSol, destination: owner, destinationLabel: `${destinationLabel} (colateral)`, manual, txUrl: `https://solscan.io/tx/${signature}` });
        return { action: "sent", amountSol };
    } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
    }
}
