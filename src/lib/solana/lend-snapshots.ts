import "server-only";
import { db } from "@/lib/db";
import type { LendPosition, SnapshotPoint } from "./jupiter-lend";

/**
 * Records the position's own numbers over time, so the APY-spread chart shows
 * THIS position and not the vault's market history. Throttled: opening the page
 * repeatedly doesn't flood the table. Best-effort — a failing DB never breaks
 * the page (the chart just has fewer points).
 */
const MIN_GAP_MS = 20 * 60 * 1000;

export async function recordLendSnapshots(positions: LendPosition[], minGapMs = MIN_GAP_MS): Promise<void> {
    for (const p of positions) {
        if (p.collateral.apr == null || p.debt.apr == null || p.collateral.apy == null || p.debt.apy == null) continue;
        try {
            const last = await db.lendSnapshot.findFirst({
                where: { owner: p.owner, vaultId: p.vaultId, nftId: p.id },
                orderBy: { capturedAt: "desc" },
                select: { capturedAt: true },
            });
            if (last && Date.now() - last.capturedAt.getTime() < minGapMs) continue;
            await db.lendSnapshot.create({
                data: {
                    owner: p.owner,
                    vaultId: p.vaultId,
                    nftId: p.id,
                    supplyApr: p.collateral.apr,
                    borrowApr: p.debt.apr,
                    supplyApy: p.collateral.apy,
                    borrowApy: p.debt.apy,
                    collateralAmount: p.collateral.amount,
                    debtAmount: p.debt.amount,
                    collateralPriceUsd: p.collateral.priceUsd,
                    debtPriceUsd: p.debt.priceUsd,
                },
            });
        } catch (err) {
            console.warn("[lend-snapshots] record failed:", (err as Error).message);
        }
    }
}

export async function readLendSnapshots(p: LendPosition, limit = 2000): Promise<SnapshotPoint[]> {
    try {
        const rows = await db.lendSnapshot.findMany({
            where: { owner: p.owner, vaultId: p.vaultId, nftId: p.id },
            orderBy: { capturedAt: "desc" },
            take: limit,
            select: { capturedAt: true, supplyApy: true, borrowApy: true },
        });
        return rows.reverse().map((r: { capturedAt: Date; supplyApy: number; borrowApy: number }) => ({ t: r.capturedAt.getTime(), supplyApy: r.supplyApy, borrowApy: r.borrowApy }));
    } catch (err) {
        console.warn("[lend-snapshots] read failed:", (err as Error).message);
        return [];
    }
}
