import "server-only";
import { Contract, formatUnits, parseUnits } from "ethers";
import { db } from "@/lib/db";
import { loadConnectedBotWallet } from "./wallet";
import { USDC_ADDRESS, USDC_DECIMALS } from "./constants";
import { notifySweep } from "@/lib/email/tx-notify";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
];

export interface PolygonSweepResult {
    action: "sent" | "skipped" | "error";
    reason?: string;
    amountUsdc?: number;
}

/**
 * Sends the REALIZED-PROFIT portion of the wallet's USDC to
 * POLYGON_SWEEP_DESTINATION — never the share committed to an open buy-back
 * order. Unlike Base/BNB (one sweep per token-settings row), this is
 * per-USER: USDC is fungible regardless of which token (GEOD, MYST, ...)
 * generated it, so one sweep covers the combined balance across every
 * enabled token bot.
 *
 * Mirrors runEvmSweepForUser's reservation logic exactly — sums
 * `usdcToBuyback` across every OPEN or PENDING_BUYBACK_ORDER lot (the USDC
 * side of a 1inch limit order stays fully liquid in the wallet until a
 * resolver fills it, so a sweep could otherwise send away exactly the funds
 * an open buy-back order needs), with the same +10% safety margin.
 *
 * `force` skips the "already swept this calendar month" gate — used by the
 * manual "Trimite acum" button.
 */
export async function runPolygonSweepForUser(userId: string, force = false): Promise<PolygonSweepResult> {
    const sweepSettings = await db.polygonSweepSettings.findUnique({ where: { userId } });
    if (!sweepSettings) return { action: "skipped", reason: "no sweep settings" };
    if (!sweepSettings.enabled && !force) return { action: "skipped", reason: "sweep disabled" };

    if (!force) {
        const now = new Date();
        if (now.getUTCDate() < 2) {
            return { action: "skipped", reason: "not the 2nd of the month yet" };
        }
        if (sweepSettings.lastSweepAt) {
            const last = sweepSettings.lastSweepAt;
            if (last.getUTCFullYear() === now.getUTCFullYear() && last.getUTCMonth() === now.getUTCMonth()) {
                return { action: "skipped", reason: "already swept this month" };
            }
        }
    }

    const destinationRaw = process.env.POLYGON_SWEEP_DESTINATION;
    if (!destinationRaw) {
        const error = "POLYGON_SWEEP_DESTINATION is not set in Vercel env vars.";
        await db.polygonSweepSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }
    const destination = destinationRaw.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(destination)) {
        const error = "POLYGON_SWEEP_DESTINATION is not a valid EVM address.";
        await db.polygonSweepSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: error },
        });
        return { action: "error", reason: error };
    }

    const wallet = loadConnectedBotWallet();
    const walletAddress = await wallet.getAddress();

    const usdc = new Contract(USDC_ADDRESS, ERC20_ABI, wallet);
    const balanceRaw: bigint = await usdc.balanceOf(walletAddress);
    const balanceUsdc = Number(formatUnits(balanceRaw, USDC_DECIMALS));

    const RESERVE_SAFETY_MARGIN = 1.1;
    const pendingLots = await db.polygonTokenLot.findMany({
        where: { userId, status: { in: ["OPEN", "PENDING_BUYBACK_ORDER"] } },
    });
    const reservedUsdc = pendingLots.reduce((sum, lot) => sum + Number(lot.usdcToBuyback), 0) * RESERVE_SAFETY_MARGIN;

    const excess = balanceUsdc - reservedUsdc;
    // Floor to 6 decimals (USDC's own precision) — never round up.
    const amountUsdc = Math.floor(excess * 1_000_000) / 1_000_000;

    if (amountUsdc <= 0) {
        await db.polygonSweepSettings.update({
            where: { userId },
            data: { lastSweepAt: new Date(), lastSweepStatus: "skipped", lastSweepError: null },
        });
        return {
            action: "skipped",
            reason: `balance ${balanceUsdc.toFixed(2)} USDC minus ${reservedUsdc.toFixed(2)} USDC reserved for open buy-back orders leaves nothing to sweep`,
        };
    }

    const amountRaw = parseUnits(amountUsdc.toFixed(USDC_DECIMALS), USDC_DECIMALS);

    try {
        const tx = await usdc.transfer(destination, amountRaw);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Transfer failed on-chain (${tx.hash})`);
        }

        await db.$transaction([
            db.polygonTokenSweep.create({
                data: {
                    userId,
                    status: "SUCCESS",
                    balanceBeforeUsdc: balanceUsdc,
                    amountUsdc,
                    destination,
                    txHash: tx.hash,
                    manual: force,
                },
            }),
            db.polygonSweepSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "ok", lastSweepError: null },
            }),
        ]);

        await notifySweep({
            chain: "Polygon",
            tokenSymbol: "USDC",
            status: "SUCCESS",
            amount: amountUsdc,
            destination,
            manual: force,
            txUrl: `https://polygonscan.com/tx/${tx.hash}`,
        });

        return { action: "sent", amountUsdc };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.$transaction([
            db.polygonTokenSweep.create({
                data: {
                    userId,
                    status: "FAILED",
                    balanceBeforeUsdc: balanceUsdc,
                    amountUsdc: 0,
                    destination,
                    errorMessage: message,
                    manual: force,
                },
            }),
            db.polygonSweepSettings.update({
                where: { userId },
                data: { lastSweepAt: new Date(), lastSweepStatus: "error", lastSweepError: message },
            }),
        ]);

        await notifySweep({
            chain: "Polygon",
            tokenSymbol: "USDC",
            status: "FAILED",
            amount: balanceUsdc,
            destination,
            manual: force,
            errorMessage: message,
        });

        return { action: "error", reason: message };
    }
}
