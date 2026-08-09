import { getCurrentBtcPrice } from "@/lib/btc";
import { db } from "@/lib/db";
import { getExchangeRate } from "@/lib/fx";
import type { OverviewData, PeriodRow, AssetFigures, AssetStats } from "@/components/overview/OverviewClient";

interface PeriodAgg {
    btcInvested: number;
    btcAmount: number;
    t212Invested: number;
    t212Value: number;
}

function computeAssetStats(monthlyRows: PeriodRow[], asset: 'btc' | 't212', transactionCount: number): AssetStats {
    const active = monthlyRows.filter((r) => r[asset].invested !== 0);
    const avgMonthlyInvested = active.length > 0
        ? active.reduce((sum, r) => sum + r[asset].invested, 0) / active.length
        : 0;

    let best: PeriodRow | null = null;
    let worst: PeriodRow | null = null;
    for (const r of active) {
        if (!best || r[asset].pnlPercent > best[asset].pnlPercent) best = r;
        if (!worst || r[asset].pnlPercent < worst[asset].pnlPercent) worst = r;
    }

    return {
        avgMonthlyInvested,
        bestMonth: best ? { label: best.label, pnlPercent: best[asset].pnlPercent } : null,
        worstMonth: worst ? { label: worst.label, pnlPercent: worst[asset].pnlPercent } : null,
        activeMonths: active.length,
        transactionCount,
    };
}

function computeAsset(invested: number, value: number, pnlOverride?: number): AssetFigures {
    const pnl = pnlOverride !== undefined ? pnlOverride : value - invested;
    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, value, pnl, pnlPercent };
}

/**
 * Calculează toate datele paginii Overview (BTC + T212 combinat, pe ani/luni,
 * statistici) — folosit atât de pagina /  cât și de generatorul de rapoarte
 * email, ca să nu existe două implementări care ar putea diverge.
 */
export async function getOverviewData(): Promise<{ data: OverviewData; usdToGbp: number }> {
    // --- BTC data ---
    const currentBtcPrice = await getCurrentBtcPrice();
    const wallets = await db.bitcoinWallet.findMany({ include: { transactions: true } });
    const allBtcTx = wallets.flatMap((w: any) => w.transactions);

    const totalBtcAmount = allBtcTx.reduce((acc: number, t: any) => acc + t.amount, 0);
    const btcCurrentValue = totalBtcAmount * currentBtcPrice;
    const btcInvested = allBtcTx.reduce((acc: number, t: any) => acc + t.amount * t.priceAtTime, 0);
    const btc = computeAsset(btcInvested, btcCurrentValue);

    // --- T212 data ---
    const t212Account = await db.t212Account.findFirst();
    let t212CurrentValueUsd = 0;
    let t212InvestedUsd = 0;
    let t212PnlUsd = 0;
    let t212Connected = false;
    let t212Snapshot: any = null;
    let gbpToUsd = 1;
    let t212BuyCount = 0;

    if (t212Account) {
        t212Connected = true;
        t212Snapshot = await db.t212Snapshot.findFirst({
            where: { accountId: t212Account.id },
            orderBy: { capturedAt: "desc" },
        });

        if (t212Snapshot) {
            gbpToUsd = await getExchangeRate(t212Snapshot.currency, "USD");
            t212CurrentValueUsd = t212Snapshot.totalValue * gbpToUsd;
            t212InvestedUsd = t212Snapshot.investedValue * gbpToUsd;
            t212PnlUsd = t212Snapshot.resultPpl * gbpToUsd;
        }
    }
    const t212 = computeAsset(t212InvestedUsd, t212CurrentValueUsd, t212PnlUsd);

    // --- Combined totals ---
    const totalInvested = btc.invested + t212.invested;
    const totalValue = btc.value + t212.value;
    const combined = computeAsset(totalInvested, totalValue, btc.pnl + t212.pnl);

    // --- Yearly / monthly breakdown ---
    const yearly = new Map<number, PeriodAgg>();
    const monthly = new Map<string, PeriodAgg>();

    const addTo = (map: Map<any, PeriodAgg>, key: any, patch: Partial<PeriodAgg>) => {
        const existing = map.get(key) ?? { btcInvested: 0, btcAmount: 0, t212Invested: 0, t212Value: 0 };
        map.set(key, {
            btcInvested: existing.btcInvested + (patch.btcInvested ?? 0),
            btcAmount: existing.btcAmount + (patch.btcAmount ?? 0),
            t212Invested: existing.t212Invested + (patch.t212Invested ?? 0),
            t212Value: existing.t212Value + (patch.t212Value ?? 0),
        });
    };

    for (const tx of allBtcTx) {
        const d = new Date(tx.timestamp);
        const invested = tx.amount * tx.priceAtTime;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        addTo(yearly, d.getFullYear(), { btcInvested: invested, btcAmount: tx.amount });
        addTo(monthly, monthKey, { btcInvested: invested, btcAmount: tx.amount });
    }

    if (t212Account) {
        const latestPositions = (t212Snapshot?.positions as any[]) ?? [];
        const currentValuePerShare = new Map<string, number>();
        for (const p of latestPositions) {
            if (p.quantity > 0) currentValuePerShare.set(p.ticker, p.currentValue / p.quantity);
        }

        const orders = await db.t212Order.findMany({
            where: { accountId: t212Account.id },
        });
        t212BuyCount = orders.filter((o: any) => o.side === "BUY").length;
        for (const o of orders) {
            const d = new Date(o.filledAt);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

            if (o.side === "BUY") {
                const investedUsd = o.total * gbpToUsd;
                const perShare = currentValuePerShare.get(o.ticker);
                const valueUsd = (perShare !== undefined ? o.quantity * perShare : o.total) * gbpToUsd;
                addTo(yearly, d.getFullYear(), { t212Invested: investedUsd, t212Value: valueUsd });
                addTo(monthly, monthKey, { t212Invested: investedUsd, t212Value: valueUsd });
            } else {
                const amountUsd = o.total * gbpToUsd;
                addTo(yearly, d.getFullYear(), { t212Invested: -amountUsd, t212Value: -amountUsd });
                addTo(monthly, monthKey, { t212Invested: -amountUsd, t212Value: -amountUsd });
            }
        }
    }

    const buildRow = (label: string, agg: PeriodAgg): PeriodRow => {
        const btcValue = agg.btcAmount * currentBtcPrice;
        const btcRow = computeAsset(agg.btcInvested, btcValue);
        const t212Row = computeAsset(agg.t212Invested, agg.t212Value);
        const totalRow = computeAsset(agg.btcInvested + agg.t212Invested, btcValue + agg.t212Value);
        return { label, btc: btcRow, t212: t212Row, total: totalRow };
    };

    const yearlyRows: PeriodRow[] = Array.from(yearly.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([year, agg]) => buildRow(String(year), agg));

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyRows: PeriodRow[] = Array.from(monthly.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, agg]) => {
            const [y, m] = key.split('-');
            const monthIdx = parseInt(m, 10) - 1;
            return buildRow(`${monthNames[monthIdx]} ${y}`, agg);
        });

    const usdToGbp = await getExchangeRate("USD", "GBP");

    const btcStats = computeAssetStats(monthlyRows, 'btc', allBtcTx.length);
    const t212Stats = computeAssetStats(monthlyRows, 't212', t212BuyCount);

    const data: OverviewData = {
        totalInvested: combined.invested,
        totalValue: combined.value,
        totalPnl: combined.pnl,
        pnlPercent: combined.pnlPercent,
        btc: { ...btc, amount: totalBtcAmount },
        t212: { ...t212, connected: t212Connected, hasSnapshot: !!t212Snapshot },
        yearlyRows,
        monthlyRows,
        t212NativeCurrency: t212Snapshot?.currency ?? null,
        t212FxRate: gbpToUsd,
        btcStats,
        t212Stats,
    };

    return { data, usdToGbp };
}

/**
 * Statistici pentru o fereastră recentă (ex: ultimele 7 zile) — folosit pentru
 * raportul săptămânal, unde nu avem o agregare pe săptămâni deja construită
 * (doar lunar/anual).
 */
export async function getRecentWindowStats(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const currentBtcPrice = await getCurrentBtcPrice();
    const wallets = await db.bitcoinWallet.findMany({ include: { transactions: true } });
    const recentBtcTx = wallets
        .flatMap((w: any) => w.transactions)
        .filter((t: any) => new Date(t.timestamp) >= since);

    const btcAmount = recentBtcTx.reduce((s: number, t: any) => s + t.amount, 0);
    const btcInvested = recentBtcTx.reduce((s: number, t: any) => s + t.amount * t.priceAtTime, 0);
    const btcValue = btcAmount * currentBtcPrice;

    let t212Invested = 0;
    let t212Value = 0;

    const t212Account = await db.t212Account.findFirst();
    if (t212Account) {
        const snapshot = await db.t212Snapshot.findFirst({
            where: { accountId: t212Account.id },
            orderBy: { capturedAt: "desc" },
        });
        const gbpToUsd = snapshot ? await getExchangeRate(snapshot.currency, "USD") : 1;
        const positions = (snapshot?.positions as any[]) ?? [];
        const priceMap = new Map<string, number>();
        for (const p of positions) {
            if (p.quantity > 0) priceMap.set(p.ticker, p.currentValue / p.quantity);
        }

        const recentOrders = await db.t212Order.findMany({
            where: { accountId: t212Account.id, filledAt: { gte: since } },
        });
        for (const o of recentOrders) {
            if (o.side === "BUY") {
                t212Invested += o.total * gbpToUsd;
                const perShare = priceMap.get(o.ticker);
                t212Value += (perShare !== undefined ? o.quantity * perShare : o.total) * gbpToUsd;
            } else {
                t212Invested -= o.total * gbpToUsd;
                t212Value -= o.total * gbpToUsd;
            }
        }
    }

    return {
        btcInvested,
        btcValue,
        t212Invested,
        t212Value,
        invested: btcInvested + t212Invested,
        value: btcValue + t212Value,
    };
}
