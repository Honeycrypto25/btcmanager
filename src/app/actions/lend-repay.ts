"use server";

import { Connection } from "@solana/web3.js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "@/lib/page-cache"; // also expires the page cache
import { requireAdmin } from "@/lib/permissions";
import { listSweepLendPositions, prepareLendRepay, sendPreparedDeposit, type DepositSimulation } from "@/lib/solana/lend-deposit";
import { loadBotKeypair, getRpcUrl, getUsdcBalance } from "@/lib/solana/wallet";
import { USDC_DECIMALS } from "@/lib/solana/constants";

export interface RepayResult {
    ok: boolean;
    message: string;
    signature?: string;
    simulation?: DepositSimulation;
}

/**
 * Repays part of a Jupiter Lend loan with USDC from the BOT wallet. Admin only. The position must belong to the
 * cold wallet (SOLANA_SWEEP_DESTINATION) and have SOL collateral; the amount can't exceed the bot's USDC nor the
 * debt. The transaction is always simulated first; `dryRun` stops there and sends nothing.
 */
export async function repayLendLoan(input: { vaultId: number; positionId: number; amountUsdc: number; dryRun?: boolean }): Promise<RepayResult> {
    await requireAdmin();
    try {
        const owner = process.env.SOLANA_SWEEP_DESTINATION?.trim();
        if (!owner) return { ok: false, message: "SOLANA_SWEEP_DESTINATION nu este setat în Vercel." };
        if (!Number.isFinite(input.amountUsdc) || input.amountUsdc <= 0) return { ok: false, message: "Introdu o sumă pozitivă de USDC." };
        const units = BigInt(Math.floor(input.amountUsdc * 10 ** USDC_DECIMALS + 1e-6));
        if (units <= 0n) return { ok: false, message: "Suma e prea mică." };

        const { positions, error } = await listSweepLendPositions(owner);
        if (error) return { ok: false, message: `Nu pot citi pozițiile de împrumut: ${error}` };
        const pos = positions.find((p) => p.id === input.positionId && p.vaultId === input.vaultId);
        if (!pos) return { ok: false, message: "Poziția nu mai există sau nu aparține walletului cold." };
        const amount = Number(units) / 10 ** USDC_DECIMALS;
        if (amount > pos.debtAmount + 0.000001) return { ok: false, message: `Suma (${amount} USDC) depășește datoria (${pos.debtAmount.toFixed(2)} USDC).` };

        const keypair = await loadBotKeypair();
        const balance = await getUsdcBalance(keypair.publicKey.toBase58());
        if (amount > balance + 0.000001) return { ok: false, message: `Botul are doar ${balance.toFixed(2)} USDC, nu ajung ${amount} USDC.` };

        const connection = new Connection(getRpcUrl(), "confirmed");
        const prepared = await prepareLendRepay(connection, keypair, { owner, vaultId: input.vaultId, positionId: input.positionId, usdcUnits: units });
        if (!prepared.simulation.ok) return { ok: false, message: `Simularea plății a eșuat (nu s-a trimis nimic): ${prepared.simulation.error}`, simulation: prepared.simulation };
        if (input.dryRun) return { ok: true, message: `Simulare reușită pentru ${amount} USDC (${prepared.simulation.unitsConsumed ?? "?"} unități de calcul). Nu s-a trimis nimic.`, simulation: prepared.simulation };

        const session = await getServerSession(authOptions);
        const userId = (session?.user as { id?: string } | undefined)?.id;
        const signature = await sendPreparedDeposit(connection, prepared, "Plată împrumut");
        // Remember it came from here (the loan transactions page marks these). Never fails the payment itself.
        if (userId) {
            await db.solanaLendRepay
                .create({ data: { userId, txSignature: signature, amountUsdc: amount, vaultId: input.vaultId, positionId: input.positionId } })
                .catch((e) => console.error("lend repay: could not record the payment", e));
        }
        revalidatePath("/cold-wallet/imprumuturi");
        revalidatePath("/cold-wallet/imprumuturi/tranzactii");
        return { ok: true, message: `Plătit ${amount} USDC în împrumutul #${pos.id}.`, signature };
    } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
}
