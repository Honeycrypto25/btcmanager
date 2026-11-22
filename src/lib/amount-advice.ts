/**
 * "Recomandare sumă pe ciclu" — pure maths, no I/O. Looks at how the bot's cash actually moves (spend on buys vs
 * proceeds coming back from sold lots) and compares the wallet balance against a target runway.
 *
 * Proceeds land in the same wallet that funds the next buy, so the runway is computed on the NET burn
 * (spend − proceeds), not on the gross spend. The decision window is the last 14 days (the profit target was
 * lowered recently, so older months under-state how often orders fill now); 30 and 90 days are shown for trend.
 */

export interface CashLot {
    boughtAt: number; // ms
    spendUsd: number;
    soldAt: number | null; // ms
    proceedsUsd: number;
}

export interface WindowFlow {
    days: number; // effective window length (shorter when the bot is younger than the window)
    buys: number;
    spend: number;
    sells: number;
    proceeds: number;
    buysPerDay: number;
    spendPerDay: number;
    proceedsPerDay: number;
    netPerDay: number; // spend − proceeds, per day (negative = the wallet is growing)
    recovery: number; // proceeds ÷ spend (0 when nothing was spent)
}

export type Verdict = "increase" | "keep" | "keep-thin" | "topup";

export interface AmountAdvice {
    verdict: Verdict;
    primary: WindowFlow;
    primaryDays: number;
    windows: { label: string; flow: WindowFlow }[];
    runwayNetDays: number | null; // null = the wallet is not shrinking
    runwayGrossDays: number; // balance ÷ scheduled spend, ignoring sales
    topUpUsd: number; // to reach the target runway on the net burn
    suggestedAmount: number | null;
    reasons: string[];
}

const DAY = 86_400_000;

export function flowFor(lots: CashLot[], days: number, now: number): WindowFlow {
    const first = lots.reduce((m, l) => Math.min(m, l.boughtAt), now);
    const eff = Math.max(1, Math.min(days, (now - first) / DAY));
    const from = now - days * DAY;
    let buys = 0, spend = 0, sells = 0, proceeds = 0;
    for (const l of lots) {
        if (l.boughtAt >= from) { buys++; spend += l.spendUsd; }
        if (l.soldAt != null && l.soldAt >= from) { sells++; proceeds += l.proceedsUsd; }
    }
    return {
        days: eff, buys, spend, sells, proceeds,
        buysPerDay: buys / eff, spendPerDay: spend / eff, proceedsPerDay: proceeds / eff,
        netPerDay: (spend - proceeds) / eff, recovery: spend > 0 ? proceeds / spend : 0,
    };
}

export function adviseAmount(opts: {
    lots: CashLot[];
    balance: number;
    buyAmount: number;
    periodHours: number;
    targetDays: number;
    strikePct: number | null; // 30-day strike, null = unknown
    noFuel30: number;
    now?: number;
    /** Wording: buy bot (spends USDC, sales bring it back) vs. reverse-DCA (sells tokens, buy-backs bring them back). */
    words?: { out: string; back: string; stock: string; topup: string };
}): AmountAdvice {
    const W = opts.words ?? { out: "cumpărări", back: "vânzări", stock: "portofel", topup: "USDC în portofel" };
    const now = opts.now ?? Date.now();
    const w14 = flowFor(opts.lots, 14, now);
    const w30 = flowFor(opts.lots, 30, now);
    const w90 = flowFor(opts.lots, 90, now);
    const primary = w14.buys >= 3 ? w14 : w30;
    const primaryDays = primary === w14 ? 14 : 30;

    const scheduledPerDay = opts.buyAmount * (24 / Math.max(1, opts.periodHours));
    const runwayGrossDays = scheduledPerDay > 0 ? opts.balance / scheduledPerDay : Infinity;
    const net = primary.netPerDay;
    const runwayNetDays = net > 0.01 ? opts.balance / net : null;
    const T = opts.targetDays;
    const topUpUsd = net > 0.01 ? Math.max(0, T * net - opts.balance) : 0;

    const reasons: string[] = [];
    const usd = (v: number) => "$" + v.toFixed(2);
    reasons.push(
        `În ultimele ${Math.round(primary.days)} zile: ${primary.buys} ${W.out} (${usd(primary.spendPerDay)}/zi) și ${primary.sells} ${W.back} (${usd(primary.proceedsPerDay)}/zi) → consum net ${usd(Math.max(0, net))}/zi.`,
    );
    reasons.push(
        runwayNetDays == null
            ? `Revenirile (${W.back}) acoperă ieșirile (${W.out}) — ${W.stock} nu scade în ritmul curent.`
            : `Autonomie netă: ${runwayNetDays.toFixed(1)} zile (țintă ${T}). Fără nicio revenire, ${W.stock} ajunge doar ${runwayGrossDays.toFixed(1)} zile.`,
    );

    let verdict: Verdict;
    let suggestedAmount: number | null = null;
    if (runwayNetDays != null && runwayNetDays < T) {
        verdict = "topup";
        reasons.push(`Pentru ${T} zile la ritmul curent mai ai nevoie de ~${usd(topUpUsd)} ${W.topup}.`);
    } else if (runwayGrossDays < 5) {
        verdict = "keep-thin";
        reasons.push(`Marjă subțire: dacă revenirile (${W.back}) se opresc câteva zile, botul rămâne fără fonduri. Nu mări suma.`);
    } else if ((runwayNetDays == null || runwayNetDays >= 2 * T) && (opts.strikePct ?? 0) >= 80 && opts.noFuel30 === 0) {
        verdict = "increase";
        // Net burn scales ~linearly with the buy size. Floor the burn fraction so a very high recovery rate can't suggest a huge jump.
        const f = Math.max(1 - primary.recovery, 0.25);
        const bpd = Math.max(primary.buysPerDay, 1 / Math.max(1, opts.periodHours / 24));
        const raw = opts.balance / (T * bpd * f);
        const capped = Math.min(Math.max(raw, opts.buyAmount), opts.buyAmount * 1.5);
        suggestedAmount = Math.round(capped * 2) / 2;
        if (suggestedAmount <= opts.buyAmount) verdict = "keep";
        reasons.push(`Strike 30 zile ${Math.round(opts.strikePct ?? 0)}%, fără cicluri ratate din lipsă de fonduri.`);
    } else {
        verdict = "keep";
        if ((opts.strikePct ?? 0) < 80) reasons.push(`Strike 30 zile ${opts.strikePct == null ? "necunoscut" : Math.round(opts.strikePct) + "%"} — sub pragul de 80% pentru a mări.`);
        if (opts.noFuel30 > 0) reasons.push(`${opts.noFuel30} cicluri în ultimele 30 de zile au fost sărite din lipsă de fonduri.`);
    }

    return {
        verdict, primary, primaryDays,
        windows: [{ label: "14 zile", flow: w14 }, { label: "30 zile", flow: w30 }, { label: "90 zile", flow: w90 }],
        runwayNetDays, runwayGrossDays, topUpUsd, suggestedAmount, reasons,
    };
}
