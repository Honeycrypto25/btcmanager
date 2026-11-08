import "server-only";
import { JUPITER_API_BASE } from "./constants";

/**
 * Read-only view of Jupiter Lend borrow positions (the position NFTs from
 * jup.ag/lend/borrow/<vault>/nfts/<id>), shown on /cold-wallet.
 *
 * Jupiter's API can't look a position up by NFT id — only by owner wallet —
 * so we query the wallets in JUPITER_LEND_WALLETS (comma-separated) or, if
 * that isn't set, the cold wallet (SOLANA_SWEEP_DESTINATION). Nothing here
 * signs or sends anything.
 *
 * Units (Fluid-based API): position `supply`/`borrow` are raw base units
 * (divide by token decimals); `collateralFactor` / `liquidationThreshold`
 * are per-mille (850 = 85%); `liquidationPenalty`, `supplyRate`, `borrowRate`
 * are 1e2 precision (100 = 1%, 369 = 3.69% APR). Checked against position #10671 on jup.ag
 * (14 SOL / 346.36 USDC → liq. price 29.1, LTV 27.79%).
 */

export interface LendPosition {
    id: number;
    vaultId: number;
    url: string;
    owner: string;
    collateral: { symbol: string; amount: number; priceUsd: number; usd: number; apy: number | null };
    debt: { symbol: string; amount: number; priceUsd: number; usd: number; apy: number | null };
    netUsd: number;
    ltv: number; // 0..1 — what jup.ag shows as "Position Health"
    maxLtv: number | null; // 0..1
    liqThreshold: number | null; // 0..1
    liqPenalty: number | null; // 0..1
    liqPrice: number | null; // collateral price (in debt token) at which the position is liquidated
    liqOffset: number | null; // 0..1 — how far the collateral price can fall before liquidation
    netApy: number | null; // 0..1
    isLiquidated: boolean;
}

export interface LendData {
    configured: boolean;
    wallets: string[];
    positions: LendPosition[];
    error: string | null;
    fetchedAt: string;
}

type Tok = { symbol?: string; uiSymbol?: string; decimals?: number; price?: string; stakingApr?: number };
type RawPosition = {
    id: number;
    vaultId: number;
    supply: string;
    borrow: string;
    isLiquidated: boolean;
    ownerAddress: string;
    vault: {
        supplyToken: Tok;
        borrowToken: Tok;
        collateralFactor?: string;
        liquidationThreshold?: string;
        liquidationPenalty?: string;
        supplyRate?: string;
        borrowRate?: string;
    };
};

const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
/** Raw base-unit string → token amount. Already-decimal strings pass through. */
const fromBase = (raw: string, decimals: number) => (raw.includes(".") ? Number(raw) : Number(raw) / 10 ** decimals);
const perMille = (v?: string) => (num(v) != null ? num(v)! / 1000 : null);
const pct1e2 = (v?: string) => (num(v) != null ? num(v)! / 10000 : null);
const toApy = (apr: number | null) => (apr == null ? null : (1 + apr / 365) ** 365 - 1);

export function lendWallets(): string[] {
    const list = (process.env.JUPITER_LEND_WALLETS || process.env.SOLANA_SWEEP_DESTINATION || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return Array.from(new Set(list));
}

function toPosition(p: RawPosition): LendPosition {
    const st = p.vault.supplyToken;
    const bt = p.vault.borrowToken;
    const colAmount = fromBase(p.supply, st.decimals ?? 9);
    const debtAmount = fromBase(p.borrow, bt.decimals ?? 6);
    const colPrice = num(st.price) ?? 0;
    const debtPrice = num(bt.price) ?? 0;
    const colUsd = colAmount * colPrice;
    const debtUsd = debtAmount * debtPrice;
    const lt = perMille(p.vault.liquidationThreshold);

    // Liquidation when debt reaches LT × collateral value → collateral price
    // expressed in the debt token (what jup.ag labels "Liq. Price").
    const liqPrice = lt && colAmount > 0 ? debtAmount / (colAmount * lt) : null;
    const curPriceInDebt = debtPrice > 0 ? colPrice / debtPrice : null;
    const liqOffset = liqPrice != null && curPriceInDebt ? 1 - liqPrice / curPriceInDebt : null;

    // API rates are APR; jup.ag shows APY (daily compounding).
    const colApy = toApy(pct1e2(p.vault.supplyRate));
    const debtApy = toApy(pct1e2(p.vault.borrowRate));
    const netUsd = colUsd - debtUsd;
    const netApy = colApy != null && debtApy != null && netUsd > 0 ? (colUsd * colApy - debtUsd * debtApy) / netUsd : null;

    return {
        id: p.id,
        vaultId: p.vaultId,
        url: `https://jup.ag/lend/borrow/${p.vaultId}/nfts/${p.id}`,
        owner: p.ownerAddress,
        collateral: { symbol: st.uiSymbol || st.symbol || "?", amount: colAmount, priceUsd: colPrice, usd: colUsd, apy: colApy },
        debt: { symbol: bt.uiSymbol || bt.symbol || "?", amount: debtAmount, priceUsd: debtPrice, usd: debtUsd, apy: debtApy },
        netUsd,
        ltv: colUsd > 0 ? debtUsd / colUsd : 0,
        maxLtv: perMille(p.vault.collateralFactor),
        liqThreshold: lt,
        liqPenalty: pct1e2(p.vault.liquidationPenalty),
        liqPrice,
        liqOffset,
        netApy,
        isLiquidated: p.isLiquidated,
    };
}

export async function getLendPositions(): Promise<LendData> {
    const wallets = lendWallets();
    const base: LendData = { configured: wallets.length > 0, wallets, positions: [], error: null, fetchedAt: new Date().toISOString() };
    if (!wallets.length) return base;
    if (!process.env.JUPITER_API_KEY) return { ...base, error: "JUPITER_API_KEY lipsește în Vercel." };

    try {
        const res = await fetch(`${JUPITER_API_BASE}/lend/v1/borrow/positions?users=${wallets.join(",")}`, {
            headers: { "x-api-key": process.env.JUPITER_API_KEY },
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Jupiter Lend a răspuns ${res.status}`);
        const raw = (await res.json()) as RawPosition[];
        const positions = (Array.isArray(raw) ? raw : [])
            .filter((p) => !p.isLiquidated && (Number(p.supply) > 0 || Number(p.borrow) > 0))
            .map(toPosition)
            .sort((a, b) => b.debt.usd - a.debt.usd);
        return { ...base, positions };
    } catch (err) {
        console.warn("[jupiter-lend] positions fetch failed:", (err as Error).message);
        return { ...base, error: (err as Error).message };
    }
}
