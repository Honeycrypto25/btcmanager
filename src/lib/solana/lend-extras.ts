import "server-only";

// Extra read-only data from Fluid's public API (Jupiter Lend runs on Fluid, no key needed):
//  - the official Position PnL jup.ag shows,
//  - the oracle price liquidations actually use,
//  - the vault's hourly rates for the last 7 days.
// Every part is best-effort: a failure returns null/[] and never hides the position.

const BASE = "https://api.solana.fluid.io/v2/main/borrowing";

export interface RatePoint {
    t: number; // ms
    supplyApr: number; // fraction, 0.0369 = 3.69%
    borrowApr: number;
}
export interface LendExtras {
    pnl: { usd: number; pct: number } | null; // Jupiter's own Position PnL
    oracle: { priceUsd: number; marketUsd: number; diffPct: number } | null; // price used for liquidation vs market
    rates: RatePoint[]; // vault-wide, hourly, with the API's own delay (a few days)
}

async function getJson<T>(path: string): Promise<T | null> {
    try {
        const res = await fetch(`${BASE}${path}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/** The raw oracle price has a vault-specific scale; pick the power of ten that lands next to the market price, else give up. */
function scaleOracle(raw: string, marketUsd: number): number | null {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || !(marketUsd > 0)) return null;
    for (let e = 0; e <= 30; e++) {
        const v = n / 10 ** e;
        if (Math.abs(v / marketUsd - 1) < 0.2) return v;
    }
    return null;
}

export async function getLendExtras(vaultId: number, nftId: number, collateralMarketUsd: number): Promise<LendExtras> {
    const [pnlRaw, vault, supply, borrow] = await Promise.all([
        getJson<{ amount?: string; percentage?: string }>(`/vaults/${vaultId}/nfts/${nftId}/pnl`),
        getJson<{ oraclePrice?: string }>(`/vaults/${vaultId}`),
        getJson<{ supplyRateLiquidity?: number; date?: string }[]>(`/vaults/${vaultId}/charts/supply-rate?range=7d`),
        getJson<{ borrowRateLiquidity?: number; date?: string }[]>(`/vaults/${vaultId}/charts/borrow-rate?range=7d`),
    ]);

    // amount is in the debt token's 6 decimals (USDC), percentage at 1e2 precision (15 = 0.15%).
    const amount = pnlRaw?.amount != null ? Number(pnlRaw.amount) / 1e6 : NaN;
    const pct = pnlRaw?.percentage != null ? Number(pnlRaw.percentage) / 1e4 : NaN;
    const pnl = Number.isFinite(amount) && Number.isFinite(pct) ? { usd: amount, pct } : null;

    const op = vault?.oraclePrice ? scaleOracle(vault.oraclePrice, collateralMarketUsd) : null;
    const oracle = op != null ? { priceUsd: op, marketUsd: collateralMarketUsd, diffPct: op / collateralMarketUsd - 1 } : null;

    const byDate = new Map<number, RatePoint>();
    for (const r of supply ?? []) {
        const t = r.date ? Date.parse(r.date) : NaN;
        if (Number.isFinite(t) && typeof r.supplyRateLiquidity === "number") byDate.set(t, { t, supplyApr: r.supplyRateLiquidity / 1e4, borrowApr: NaN });
    }
    for (const r of borrow ?? []) {
        const t = r.date ? Date.parse(r.date) : NaN;
        const e = byDate.get(t);
        if (e && typeof r.borrowRateLiquidity === "number") e.borrowApr = r.borrowRateLiquidity / 1e4;
    }
    const rates = [...byDate.values()].filter((r) => Number.isFinite(r.borrowApr)).sort((a, b) => a.t - b.t);

    return { pnl, oracle, rates };
}
