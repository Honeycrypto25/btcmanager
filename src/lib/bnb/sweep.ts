import "server-only";
import { Contract, formatUnits, parseUnits } from "ethers";
import { db } from "@/lib/db";
import { loadConnectedBotWallet } from "./wallet";
import { WBNB_ADDRESS, WBNB_DECIMALS } from "./constants";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
];

export interface BnbSweepResult {
    action: "sent" | "skipped" | "error";
    reason?: string;
    amountBnb?: number;
}

/**
 * Sends ALL available WBNB in the bot's hot wallet to BNB_SWEEP_DESTINATION
 * (a Vercel env var, never stored in the database — see the schema comment
 * on BnbSettings.sweepEnabled). Native BNB (the gas float) is never touched
 * by this function — see the schema comment on BnbSettings for why.
 *
 * Unlike Solana (where SOL must stay behind to pay for the bot's own
 * transactions), WBNB pays no fees on BNB Chain — there's nothing it needs to be
 * kept for, so the minimum-to-keep is hardcoded to 0 rather than a
 * user-editable setting (BnbSettings.sweepMinBalanceBnb still exists in
 * the schema for backward compatibility but is intentionally ignored here).
 *
 * Always reads the REAL on-chain WBNB balance rather than the app's own
 * bnbRemaining bookkeeping. The amount sent is floored to 6 decimals
 * (never rounded up). Mirrors runSolanaSweepForUser field-for-field, with
 * one deliberate difference: see reservedBnb below.
 *
 * IMPORTANT difference from Solana: a Jupiter Trigger order escrows the
 * SOL on-chain the moment it's placed, so a wallet-balance sweep
 * automatically can't touch it. A 1inch limit order is only a gasless,
 * off-chain signature — the WBNB it will sell stays completely liquid in
 * the wallet until a resolver actually fills the order. Without
 * accounting for that, a sweep could send away exactly the WBNB an open
 * order is counting on, and the order would then fail to fill (or fill
 * short) once the price target is hit. reservedBnb below subtracts every
 * OPEN lot's planned sell amount before computing what's actually free to
 * sweep.
 *
 * `force` skips the "already swept this calendar month" gate — used by the
 * manual "Trimite acum" test button.
 */
export async function runBnbSweepForUser(userId: string, force = false): Promise<BnbSweepResult> {
    const settings = await db.bnbSettings.findUnique({ where: { userId } });
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

    const destinationRaw = process.env.BNB_SWEEP_DESTINATION;
    if (!destinationRaw) {
        const error = "BNB_SWEEP_DESTINATION is not set in Vercel env vars.";
        await db.bnbSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }
    const destination = destinationRaw.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(destination)) {
        const error = "BNB_SWEEP_DESTINATION is not a valid EVM address.";
        await db.bnbSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const wallet = loadConnectedBotWallet();
    const walletAddress = await wallet.getAddress();
    if (walletAddress.toLowerCase() !== settings.walletAddress.toLowerCase()) {
        const error = "BASE_PRIVATE_KEY does not match the wallet address configured in settings — refusing to sweep.";
        await db.bnbSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const bnb = new Contract(WBNB_ADDRESS, ERC20_ABI, wallet);
    const balanceRaw: bigint = await bnb.balanceOf(walletAddress);
    const balanceBnb = Number(formatUnits(balanceRaw, WBNB_DECIMALS));

    // WBNB already promised to an open sell order — never sweepable, even
    // though it's sitting in the wallet's own balance (see the doc comment
    // above). Reads live from the DB rather than trusting a cached sum
    // anywhere, same "always the real current state" principle as the
    // on-chain balance check just above.
    const openLots = await db.bnbLot.findMany({ where: { userId, status: "OPEN" } });
    const reservedBnb = openLots.reduce((sum, lot) => sum + Number(lot.sellAmountBnbPlanned ?? 0), 0);

    // Hardcoded, not read from settings.sweepMinBalanceBnb — see the function doc above.
    const minBalance = 0;
    const excess = balanceBnb - reservedBnb - minBalance;
    // Floor to 6 decimals — never round up, so the wallet never dips below minBalance (or into reserved funds).
    const amountBnb = Math.floor(excess * 1_000_000) / 1_000_000;

    if (amountBnb <= 0) {
        await db.bnbSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "skipped", lastSweepError: null },
        });
        return {
            action: "skipped",
            reason: `balance ${balanceBnb.toFixed(6)} WBNB minus ${reservedBnb.toFixed(6)} WBNB reserved for open orders is at or below the ${minBalance} WBNB minimum`,
        };
    }

    const amountRaw = parseUnits(amountBnb.toFixed(WBNB_DECIMALS), WBNB_DECIMALS);

    try {
        const tx = await bnb.transfer(destination, amountRaw);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Transfer failed on-chain (${tx.hash})`);
        }

        await db.$transaction([
            db.bnbSweep.create({
                data: {
                    userId,
                    status: "SUCCESS",
                    balanceBeforeBnb: balanceBnb,
                    amountBnb,
                    destination,
                    txHash: tx.hash,
                    manual: force,
                },
            }),
            db.bnbSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "ok", lastSweepError: null },
            }),
        ]);

        return { action: "sent", amountBnb };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.$transaction([
            db.bnbSweep.create({
                data: {
                    userId,
                    status: "FAILED",
                    balanceBeforeBnb: balanceBnb,
                    amountBnb: 0,
                    destination,
                    errorMessage: message,
                    manual: force,
                },
            }),
            db.bnbSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: message },
            }),
        ]);
        return { action: "error", reason: message };
    }
}
