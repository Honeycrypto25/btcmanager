import "server-only";
import { Contract, formatUnits, parseUnits } from "ethers";
import { db } from "@/lib/db";
import { loadConnectedBotWallet } from "./wallet";
import { WETH_ADDRESS, WETH_DECIMALS } from "./constants";
import { notifySweep } from "@/lib/email/tx-notify";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
];

export interface EvmSweepResult {
    action: "sent" | "skipped" | "error";
    reason?: string;
    amountWeth?: number;
}

/**
 * Sends ALL available WETH in the bot's hot wallet to BASE_SWEEP_DESTINATION
 * (a Vercel env var, never stored in the database — see the schema comment
 * on EvmSettings.sweepEnabled). Native ETH (the gas float) is never touched
 * by this function — see the schema comment on EvmSettings for why.
 *
 * Unlike Solana (where SOL must stay behind to pay for the bot's own
 * transactions), WETH pays no fees on Base — there's nothing it needs to be
 * kept for, so the minimum-to-keep is hardcoded to 0 rather than a
 * user-editable setting (EvmSettings.sweepMinBalanceWeth still exists in
 * the schema for backward compatibility but is intentionally ignored here).
 *
 * Always reads the REAL on-chain WETH balance rather than the app's own
 * wethRemaining bookkeeping. The amount sent is floored to 6 decimals
 * (never rounded up). Mirrors runSolanaSweepForUser field-for-field, with
 * one deliberate difference: see reservedWeth below.
 *
 * IMPORTANT difference from Solana: a Jupiter Trigger order escrows the
 * SOL on-chain the moment it's placed, so a wallet-balance sweep
 * automatically can't touch it. A 1inch limit order is only a gasless,
 * off-chain signature — the WETH it will sell stays completely liquid in
 * the wallet until a resolver actually fills the order. Without
 * accounting for that, a sweep could send away exactly the WETH an open
 * order is counting on, and the order would then fail to fill (or fill
 * short) once the price target is hit. reservedWeth below subtracts every
 * OPEN lot's planned sell amount before computing what's actually free to
 * sweep.
 *
 * `force` skips the "already swept this calendar month" gate — used by the
 * manual "Trimite acum" test button.
 */
export async function runEvmSweepForUser(userId: string, force = false): Promise<EvmSweepResult> {
    const settings = await db.evmSettings.findUnique({ where: { userId } });
    if (!settings) return { action: "skipped", reason: "no settings" };
    if (!settings.sweepEnabled && !force) return { action: "skipped", reason: "sweep disabled" };

    if (!force) {
        const now = new Date();
        // Hardcoded to the 2nd of the month (UTC, matching the cron's own
        // schedule) rather than "whatever day the month first ticks over" —
        // >= 2 instead of === 2 as a self-healing catch-up, same reasoning
        // as the Solana sweep this mirrors.
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

    const destinationRaw = process.env.BASE_SWEEP_DESTINATION;
    if (!destinationRaw) {
        const error = "BASE_SWEEP_DESTINATION is not set in Vercel env vars.";
        await db.evmSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }
    const destination = destinationRaw.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(destination)) {
        const error = "BASE_SWEEP_DESTINATION is not a valid EVM address.";
        await db.evmSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const wallet = loadConnectedBotWallet();
    const walletAddress = await wallet.getAddress();
    if (walletAddress.toLowerCase() !== settings.walletAddress.toLowerCase()) {
        const error = "BASE_PRIVATE_KEY does not match the wallet address configured in settings — refusing to sweep.";
        await db.evmSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const weth = new Contract(WETH_ADDRESS, ERC20_ABI, wallet);
    const balanceRaw: bigint = await weth.balanceOf(walletAddress);
    const balanceWeth = Number(formatUnits(balanceRaw, WETH_DECIMALS));

    // WETH already promised to an open sell order — never sweepable, even
    // though it's sitting in the wallet's own balance (see the doc comment
    // above). Reads live from the DB rather than trusting a cached sum
    // anywhere, same "always the real current state" principle as the
    // on-chain balance check just above.
    //
    // A flat +10% safety margin is added on top of the planned amounts —
    // slippage on the eventual fill, or a lot created between this
    // computation and the actual transfer, could otherwise leave an open
    // order short by a hair. Costs nothing but a slightly slower ramp-up of
    // what's sweepable each month; correctness here matters more than
    // maximizing the swept amount.
    const RESERVE_SAFETY_MARGIN = 1.1;
    const openLots = await db.evmLot.findMany({ where: { userId, status: "OPEN" } });
    const reservedWeth = openLots.reduce((sum, lot) => sum + Number(lot.sellAmountWethPlanned ?? 0), 0) * RESERVE_SAFETY_MARGIN;

    // Hardcoded, not read from settings.sweepMinBalanceWeth — see the function doc above.
    const minBalance = 0;
    const excess = balanceWeth - reservedWeth - minBalance;
    // Floor to 6 decimals — never round up, so the wallet never dips below minBalance (or into reserved funds).
    const amountWeth = Math.floor(excess * 1_000_000) / 1_000_000;

    if (amountWeth <= 0) {
        await db.evmSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "skipped", lastSweepError: null },
        });
        return {
            action: "skipped",
            reason: `balance ${balanceWeth.toFixed(6)} WETH minus ${reservedWeth.toFixed(6)} WETH reserved for open orders is at or below the ${minBalance} WETH minimum`,
        };
    }

    const amountRaw = parseUnits(amountWeth.toFixed(WETH_DECIMALS), WETH_DECIMALS);

    try {
        const tx = await weth.transfer(destination, amountRaw);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Transfer failed on-chain (${tx.hash})`);
        }

        await db.$transaction([
            db.evmSweep.create({
                data: {
                    userId,
                    status: "SUCCESS",
                    balanceBeforeWeth: balanceWeth,
                    amountWeth,
                    destination,
                    txHash: tx.hash,
                    manual: force,
                },
            }),
            db.evmSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "ok", lastSweepError: null },
            }),
        ]);

        await notifySweep({
            chain: "Base (ETH)",
            tokenSymbol: "WETH",
            status: "SUCCESS",
            amount: amountWeth,
            destination,
            manual: force,
            txUrl: `https://basescan.org/tx/${tx.hash}`,
        });

        return { action: "sent", amountWeth };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.$transaction([
            db.evmSweep.create({
                data: {
                    userId,
                    status: "FAILED",
                    balanceBeforeWeth: balanceWeth,
                    amountWeth: 0,
                    destination,
                    errorMessage: message,
                    manual: force,
                },
            }),
            db.evmSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: message },
            }),
        ]);

        await notifySweep({
            chain: "Base (ETH)",
            tokenSymbol: "WETH",
            status: "FAILED",
            amount: balanceWeth,
            destination,
            manual: force,
            errorMessage: message,
        });

        return { action: "error", reason: message };
    }
}
