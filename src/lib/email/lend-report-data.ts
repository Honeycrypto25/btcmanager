import "server-only";
import { db } from "@/lib/db";
import { getLendOverview, type LendPositionFull } from "@/lib/solana/jupiter-lend";
import { lendCapLtv } from "@/lib/solana/lend-config";

/** One Jupiter Lend loan for the weekly/monthly email. Figures for the period are over [start, end). */
export interface LendReportData {
    label: string;
    collateralUsd: number;
    debtUsd: number;
    netUsd: number;
    ltv: number;
    capLtv: number;
    liqPriceUsd: number | null;
    liqSymbol: string;
    pnlUsd: number | null; // Jupiter's own Position PnL
    netApy: number | null;
    /** Interest accrued during the period (from the accrued curve); null while the loan is older than the data. */
    earnedUsd: number | null;
    paidUsd: number | null;
    /** What the Solana bot realized in the same period, for comparison with the interest paid. */
    botRealizedUsd: number | null;
    botRealizedCount: number;
}

const DAY = 24 * 3600 * 1000;

/** Cumulative interest (earned, paid) at time t: interpolates the curve, extrapolates after its end at today's daily rate. */
function interestAt(p: LendPositionFull, t: number): { earned: number; paid: number } {
    const c = p.curve;
    const i = p.interest;
    if (!i || c.length === 0) return { earned: 0, paid: 0 };
    const first = c[0];
    const last = c[c.length - 1];
    if (t <= first.t) return { earned: 0, paid: 0 };
    if (t >= last.t) {
        const days = (t - last.t) / DAY;
        return { earned: last.earnedUsd + i.projection.day.earnedUsd * days, paid: last.paidUsd + i.projection.day.paidUsd * days };
    }
    let k = 1;
    while (c[k].t < t) k++;
    const a = c[k - 1];
    const b = c[k];
    const f = (t - a.t) / (b.t - a.t || 1);
    return { earned: a.earnedUsd + (b.earnedUsd - a.earnedUsd) * f, paid: a.paidUsd + (b.paidUsd - a.paidUsd) * f };
}

/** Best-effort: any failure returns null so the report still goes out without this card. */
export async function getLendReportData(start: Date, end: Date): Promise<LendReportData | null> {
    try {
        const lend = await getLendOverview();
        const p = lend.positions[0];
        if (!p) return null;

        let earnedUsd: number | null = null;
        let paidUsd: number | null = null;
        if (p.interest && p.curve.length > 0 && end.getTime() > p.curve[0].t) {
            const a = interestAt(p, start.getTime());
            const b = interestAt(p, Math.min(end.getTime(), Date.now()));
            earnedUsd = Math.max(0, b.earned - a.earned);
            paidUsd = Math.max(0, b.paid - a.paid);
        }

        let botRealizedUsd: number | null = null;
        let botRealizedCount = 0;
        try {
            const sold = await db.solanaLot.findMany({ where: { status: "FILLED", soldAt: { gte: start, lt: end } }, select: { realizedPnlUsd: true } });
            botRealizedCount = sold.length;
            botRealizedUsd = sold.reduce((s: number, l: { realizedPnlUsd: unknown }) => s + Number(l.realizedPnlUsd ?? 0), 0);
        } catch {
            // no bot data — omit the comparison
        }

        return {
            label: `Jupiter Lend ${p.collateral.symbol}/${p.debt.symbol} #${p.id}`,
            collateralUsd: p.collateral.usd,
            debtUsd: p.debt.usd,
            netUsd: p.netUsd,
            ltv: p.ltv,
            capLtv: lendCapLtv(),
            liqPriceUsd: p.liqPriceUsd,
            liqSymbol: p.collateral.symbol,
            pnlUsd: p.extras.pnl?.usd ?? null,
            netApy: p.netApy,
            earnedUsd,
            paidUsd,
            botRealizedUsd,
            botRealizedCount,
        };
    } catch {
        return null;
    }
}
