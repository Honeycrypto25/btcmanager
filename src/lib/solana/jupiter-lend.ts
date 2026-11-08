import "server-only";
import { JUPITER_API_BASE } from "./constants";
import { getPriceLevelHistory } from "./lend-price-history";
import { readLendSnapshots, recordLendSnapshots } from "./lend-snapshots";

/**
 * Read-only view of Jupiter Lend borrow positions (the position NFTs from
 * jup.ag/lend/borrow/<vault>/nfts/<id>), shown on /cold-wallet/imprumuturi.
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
    collateral: { symbol: string; amount: number; priceUsd: number; usd: number; apr: number | null; apy: number | null };
    debt: { symbol: string; amount: number; priceUsd: number; usd: number; apr: number | null; apy: number | null };
    netUsd: number;
    ltv: number; // 0..1 — what jup.ag shows as "Position Health"
    maxLtv: number | null; // 0..1
    liqThreshold: number | null; // 0..1
    liqPenalty: number | null; // 0..1
    liqPrice: number | null; // collateral price (in debt token) at which the position is liquidated
    liqOffset: number | null; // 0..1 — how far the collateral price can fall before liquidation
    netApy: number | null; // 0..1
    isLiquidated: boolean;
    decimals: { collateral: number; debt: number };
    liqPriceUsd: number | null; // collateral price in USD at which the position is liquidated
    profit: Profitability;
}

/**
 * Is the position making money? Comparing the two rates alone is misleading:
 * 3.76% on the collateral vs 5.58% on the loan looks negative, but the
 * collateral is several times the debt, so what counts is rate × amount.
 *   net/year = collateralUsd × collateralApy − debtUsd × debtApy
 * Break-even rates follow from net = 0 (ltv = debtUsd / collateralUsd):
 *   collateral APY must stay above  debtApy × ltv
 *   borrow APY must stay below      collateralApy / ltv
 */
export interface Profitability {
    positive: boolean;
    spread: number | null; // collateralApy − debtApy, as a fraction (−0.0182 = −1.82 pp)
    netYearUsd: number | null;
    collateralToDebt: number | null; // collateralUsd / debtUsd
    breakEvenCollateralApy: number | null;
    breakEvenBorrowApy: number | null;
}

export interface SnapshotPoint {
    t: number; // ms
    supplyApy: number;
    borrowApy: number;
}

/** Where the collateral price has been relative to the liquidation price (from daily candles). */
export interface PriceLevelHistory {
    symbol: string;
    level: number; // USD
    lastAtOrBelow: { at: string; low: number; daysAgo: number } | null; // last day the price traded at/below the level
    min12m: { at: string; low: number } | null;
    coverageFrom: string;
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
    const colApr = pct1e2(p.vault.supplyRate);
    const debtApr = pct1e2(p.vault.borrowRate);
    const colApy = toApy(colApr);
    const debtApy = toApy(debtApr);
    const netUsd = colUsd - debtUsd;
    const netApy = colApy != null && debtApy != null && netUsd > 0 ? (colUsd * colApy - debtUsd * debtApy) / netUsd : null;

    const ltv = colUsd > 0 ? debtUsd / colUsd : 0;
    const netYearUsd = colApy != null && debtApy != null ? colUsd * colApy - debtUsd * debtApy : null;
    const profit: Profitability = {
        positive: netYearUsd == null ? true : netYearUsd >= 0,
        spread: colApy != null && debtApy != null ? colApy - debtApy : null,
        netYearUsd,
        collateralToDebt: debtUsd > 0 ? colUsd / debtUsd : null,
        breakEvenCollateralApy: debtApy != null && debtUsd > 0 ? debtApy * ltv : null,
        breakEvenBorrowApy: colApy != null && ltv > 0 ? colApy / ltv : null,
    };

    return {
        id: p.id,
        vaultId: p.vaultId,
        url: `https://jup.ag/lend/borrow/${p.vaultId}/nfts/${p.id}`,
        owner: p.ownerAddress,
        collateral: { symbol: st.uiSymbol || st.symbol || "?", amount: colAmount, priceUsd: colPrice, usd: colUsd, apr: colApr, apy: colApy },
        debt: { symbol: bt.uiSymbol || bt.symbol || "?", amount: debtAmount, priceUsd: debtPrice, usd: debtUsd, apr: debtApr, apy: debtApy },
        netUsd,
        ltv,
        maxLtv: perMille(p.vault.collateralFactor),
        liqThreshold: lt,
        liqPenalty: pct1e2(p.vault.liquidationPenalty),
        liqPrice,
        liqOffset,
        netApy,
        isLiquidated: p.isLiquidated,
        decimals: { collateral: st.decimals ?? 9, debt: bt.decimals ?? 6 },
        liqPriceUsd: lt && colAmount > 0 ? debtUsd / (colAmount * lt) : null,
        profit,
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

// ---------------------------------------------------------------------------
// History + interest
// ---------------------------------------------------------------------------

/**
 * Transaction history comes from Fluid's public API — the same one jup.ag's
 * "History" tab reads (Jupiter Lend is built on Fluid). No key needed.
 *   GET /v2/<market>/borrowing/vaults/<vaultId>/nfts/<nftId>/actions?page=N
 * Amounts are raw base units; the *Usd fields are the USD value at the time
 * of the transaction. "Collateral"/"Debt" are amounts put in (deposit /
 * borrow) and the matching "…Refund" fields are amounts taken out (withdraw /
 * payback). Only deposit + borrow rows existed on the checked position, so
 * the out-direction is an assumption from the field names.
 */
const FLUID_API = "https://api.solana.fluid.io/v2";

export interface LendAction {
    id: number;
    type: string; // deposit | borrow | payback | withdraw | multiply | unwind …
    at: string; // ISO
    signature: string;
    status: string;
    collateralIn: number; // token units
    collateralOut: number;
    debtIn: number;
    debtOut: number;
    collateralInUsd: number;
    collateralOutUsd: number;
    debtInUsd: number;
    debtOutUsd: number;
}

type RawAction = Record<string, string | number | null | undefined>;

export interface LendInterest {
    netDeposited: number; // collateral token, deposits − withdrawals
    earned: number; // collateral token earned so far
    earnedUsd: number; // at today's price
    netBorrowed: number; // debt token, borrows − paybacks
    paid: number; // debt token owed as interest so far
    paidUsd: number;
    netUsd: number; // earnedUsd − paidUsd
    projection: { day: ProjPoint; month: ProjPoint; year: ProjPoint }; // at today's balances, rates and prices
    openedAt: string | null;
}
export interface ProjPoint {
    earnedUsd: number;
    paidUsd: number;
    netUsd: number;
}
export interface InterestPoint {
    t: number; // ms
    earnedUsd: number;
    paidUsd: number;
    actual?: boolean;
}

export interface LendPositionFull extends LendPosition {
    actions: LendAction[] | null;
    interest: LendInterest | null;
    curve: InterestPoint[];
    snapshots: SnapshotPoint[]; // this position's own recorded APYs over time
    liqHistory: PriceLevelHistory | null;
}
export interface LendOverview {
    configured: boolean;
    wallets: string[];
    positions: LendPositionFull[];
    error: string | null;
    historyError: string | null;
    fetchedAt: string;
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

function toAction(r: RawAction, colDec: number, debtDec: number): LendAction {
    const n = (k: string) => num(r[k]) ?? 0;
    return {
        id: n("id"),
        type: String(r.type ?? "?"),
        at: String(r.createdAt ?? ""),
        signature: String(r.signature ?? ""),
        status: String(r.status ?? ""),
        collateralIn: n("token0Collateral") / 10 ** colDec,
        collateralOut: n("token0CollateralRefund") / 10 ** colDec,
        debtIn: n("token0Debt") / 10 ** debtDec,
        debtOut: n("token0DebtRefund") / 10 ** debtDec,
        collateralInUsd: n("token0CollateralUsd"),
        collateralOutUsd: n("token0CollateralRefundUsd"),
        debtInUsd: n("token0DebtUsd"),
        debtOutUsd: n("token0DebtRefundUsd"),
    };
}

/** All history rows of one position, newest first (as the API returns them). */
async function fetchActions(vaultId: number, nftId: number, colDec: number, debtDec: number): Promise<LendAction[]> {
    const out: LendAction[] = [];
    for (let page = 1; page <= 30; page++) {
        const res = await fetch(`${FLUID_API}/main/borrowing/vaults/${vaultId}/nfts/${nftId}/actions?page=${page}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Istoric Fluid: răspuns ${res.status}`);
        const body = (await res.json()) as { meta?: { lastPage?: number }; data?: RawAction[] };
        for (const r of body.data ?? []) out.push(toAction(r, colDec, debtDec));
        if (page >= (body.meta?.lastPage ?? 1)) break;
    }
    return out;
}

/**
 * Interest so far = what the position holds now minus what was put in.
 * The supply side grows with the supply rate and the debt grows with the
 * borrow rate, so both differences are pure interest. Checked on #10671:
 * 14.000000002 SOL deposited vs 14.000028004 SOL held; 346.3668 USDC
 * borrowed vs 346.367794 owed.
 */
export function computeInterest(p: LendPosition, actions: LendAction[]): LendInterest | null {
    const ok = actions.filter((a) => a.status === "success");
    if (!ok.length) return null;
    const netDeposited = ok.reduce((s, a) => s + a.collateralIn - a.collateralOut, 0);
    const netBorrowed = ok.reduce((s, a) => s + a.debtIn - a.debtOut, 0);
    const earned = p.collateral.amount - netDeposited;
    const paid = p.debt.amount - netBorrowed;

    // A negative difference beyond rounding means the history doesn't match the
    // position (e.g. a transaction type we don't understand) — don't show a wrong number.
    if (earned < -p.collateral.amount * 1e-4 || paid < -p.debt.amount * 1e-4) return null;
    const earnedTok = Math.max(0, earned);
    const paidTok = Math.max(0, paid);

    const yearEarned = p.collateral.usd * (p.collateral.apy ?? 0);
    const yearPaid = p.debt.usd * (p.debt.apy ?? 0);
    const proj = (f: number): ProjPoint => ({ earnedUsd: yearEarned * f, paidUsd: yearPaid * f, netUsd: (yearEarned - yearPaid) * f });
    const first = ok.reduce((m, a) => (a.at < m ? a.at : m), ok[0].at);

    return {
        netDeposited,
        earned: earnedTok,
        earnedUsd: earnedTok * p.collateral.priceUsd,
        netBorrowed,
        paid: paidTok,
        paidUsd: paidTok * p.debt.priceUsd,
        netUsd: earnedTok * p.collateral.priceUsd - paidTok * p.debt.priceUsd,
        projection: { day: proj(1 / 365), month: proj(1 / 12), year: proj(1) },
        openedAt: first,
    };
}

/**
 * Cumulative interest from the first transaction to now. The API only gives
 * today's balance, so the in-between points are modelled: principal over time
 * (from the transactions) × today's rate, then scaled so the last point equals
 * the real figure. On #10671 the unscaled model gave 2.81e-5 SOL vs the real
 * 2.80e-5, so the scale factor stays close to 1.
 */
export function interestCurve(p: LendPosition, actions: LendAction[], interest: LendInterest | null, now = Date.now(), steps = 24): InterestPoint[] {
    if (!interest || !interest.openedAt) return [];
    const ok = actions.filter((a) => a.status === "success").sort((a, b) => (a.at < b.at ? -1 : 1));
    const start = new Date(interest.openedAt).getTime();
    if (!(now > start)) return [];

    const supplyApr = p.collateral.apr ?? 0;
    const borrowApr = p.debt.apr ?? 0;
    // principal as a step function of time
    const accrue = (t: number) => {
        let col = 0;
        let debt = 0;
        let last = start;
        let e = 0;
        let d = 0;
        for (const a of ok) {
            const at = new Date(a.at).getTime();
            if (at >= t) break;
            e += (col * supplyApr * (at - last)) / YEAR_MS;
            d += (debt * borrowApr * (at - last)) / YEAR_MS;
            col += a.collateralIn - a.collateralOut;
            debt += a.debtIn - a.debtOut;
            last = at;
        }
        e += (col * supplyApr * (t - last)) / YEAR_MS;
        d += (debt * borrowApr * (t - last)) / YEAR_MS;
        return { e, d };
    };

    const end = accrue(now);
    const ratio = (real: number, model: number) => (model > 0 && real / model > 0.5 && real / model < 2 ? real / model : 1);
    const ke = ratio(interest.earned, end.e);
    const kd = ratio(interest.paid, end.d);

    const pts: InterestPoint[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = start + ((now - start) * i) / steps;
        const m = accrue(t);
        const last = i === steps;
        pts.push({
            t,
            earnedUsd: (last ? interest.earned : m.e * ke) * p.collateral.priceUsd,
            paidUsd: (last ? interest.paid : m.d * kd) * p.debt.priceUsd,
            actual: last || undefined,
        });
    }
    return pts;
}

/**
 * Positions + history + interest + own recorded rates. History failing never
 * hides the positions. `record` writes a (throttled) snapshot of today's rates —
 * only the Împrumuturi page and the daily cron ask for it.
 */
export async function getLendOverview(opts: { record?: boolean } = {}): Promise<LendOverview> {
    const base = await getLendPositions();
    let historyError: string | null = null;
    if (opts.record) await recordLendSnapshots(base.positions);
    const positions: LendPositionFull[] = await Promise.all(
        base.positions.map(async (p) => {
            const [snapshots, liqHistory] = await Promise.all([readLendSnapshots(p), getPriceLevelHistory(p.collateral.symbol, p.liqPriceUsd)]);
            try {
                const actions = await fetchActions(p.vaultId, p.id, p.decimals.collateral, p.decimals.debt);
                const interest = computeInterest(p, actions);
                return { ...p, actions, interest, curve: interestCurve(p, actions, interest), snapshots, liqHistory };
            } catch (err) {
                historyError = (err as Error).message;
                console.warn("[jupiter-lend] history fetch failed:", historyError);
                return { ...p, actions: null, interest: null, curve: [], snapshots, liqHistory };
            }
        })
    );
    return { configured: base.configured, wallets: base.wallets, positions, error: base.error, historyError, fetchedAt: base.fetchedAt };
}
