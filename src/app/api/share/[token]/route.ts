import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTokenPriceUsd } from "@/lib/polygon/oneinch";
import { USDC_ADDRESS } from "@/lib/polygon/constants";
import { readVisitor } from "@/lib/share/visitor";
import { SHARE_CSS } from "@/lib/share/theme";
import { getBotUptime } from "@/lib/bot-uptime";
import { areaChart, barChart, donut, esc, lineChart, sparkline, type TipRow } from "@/lib/share/svg";

/**
 * Public, read-only stats page for ONE Polygon token, reached by a secret
 * link made in Admin. It lives under /api on purpose: the site's auth
 * middleware doesn't cover /api, so no security setting had to change.
 *
 * What it can see: only the lots of the token the link was made for.
 * What it never shows: wallet addresses, transaction / order hashes, notes,
 * sweeps, or anything from another token or section.
 */
export const dynamic = "force-dynamic";

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tok = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const MONTHS = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"];
const STATUS: Record<string, [string, string]> = {
    PENDING_BUYBACK_ORDER: ["Ordin în curs", "#fb923c"],
    OPEN: ["Ordin activ", "#e8bc70"],
    FILLED: ["Răscumpărat", "#4ade80"],
    CANCELLED: ["Anulat", "#8b8b8b"],
    FAILED: ["Eșuat", "#f87171"],
};

const NAMES: Record<string, string> = { GEOD: "GEODNET", MYST: "Mysterium" };
const DAY = 86_400_000;
const PAGE_SIZE = 10;
/** Profit split between the two partners (percentages add up to 100). */
const SPLIT = [{ name: "Sergiu", pct: 50 }, { name: "Bogdan", pct: 50 }] as const;

function page(title: string, body: string, status = 200) {
    const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#07080b"><title>${esc(title)}</title><style>${SHARE_CSS}</style></head><body><div class="wrap">${body}</div></body></html>`;
    return new Response(html, {
        status,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
            "referrer-policy": "no-referrer",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'",
        },
    });
}

const msg = (title: string, text: string, status: number) =>
    page(title, `<div class="hero"><h1>${esc(title)}</h1><p class="sub">${esc(text)}</p></div>`, status);

/** Month-by-month breakdown table (newest first) with a totals row and optional average row. */
function monthTable(head: string[], rows: string[][], foot: string[][], avg?: string[]): string {
    const th = head.map((h, i) => `<th${i ? ' class="r"' : ""}>${h}</th>`).join("");
    const tr = (r: string[]) => `<tr>${r.map((c, i) => `<td${i ? ' class="r"' : ""}>${c}</td>`).join("")}</tr>`;
    return `<div class="tw mt"><table class="mtab"><thead><tr>${th}</tr></thead><tbody>${rows.map(tr).join("") || `<tr><td colspan="${head.length}" class="m">Nicio activitate încă.</td></tr>`}</tbody><tfoot>${foot.map(tr).join("")}${avg ? `<tr class="avg">${avg.map((c, i) => `<td${i ? ' class="r"' : ""}>${c}</td>`).join("")}</tr>` : ""}</tfoot></table></div>`;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const link = token && token.length >= 20 && token.length <= 64
        ? await db.shareLink.findUnique({ where: { token } })
        : null;
    if (!link || link.kind !== "POLYGON_TOKEN") return msg("Link indisponibil", "Linkul nu există sau a fost șters.", 404);
    if (link.revokedAt) return msg("Link dezactivat", "Accesul prin acest link a fost oprit.", 410);
    if (link.expiresAt && link.expiresAt < new Date()) return msg("Link expirat", "Acest link nu mai este valabil.", 410);

    // Log the visit — but not when the owner (logged in) opens it themselves.
    try {
        const session = await getServerSession(authOptions);
        const isOwner = (session?.user as { id?: string } | undefined)?.id === link.userId;
        if (!isOwner) {
            const v = readVisitor(req.headers, link.id);
            await db.shareLinkView.create({ data: { linkId: link.id, ...v } });
        }
    } catch (e) {
        console.error("[share] failed to log view", e);
    }

    const settings = await db.polygonTokenSettings.findFirst({ where: { id: link.settingsId, userId: link.userId } });
    if (!settings) return msg("Indisponibil", "Datele nu mai sunt disponibile.", 404);
    const lots = await db.polygonTokenLot.findMany({
        where: { userId: link.userId, settingsId: link.settingsId },
        orderBy: { soldAt: "desc" },
    });
    const [price, uptime] = await Promise.all([
        getTokenPriceUsd(settings.tokenAddress, settings.tokenDecimals, USDC_ADDRESS).catch(() => null),
        getBotUptime({ userId: link.userId, bot: `POLYGON:${settings.tokenSymbol}`, label: settings.tokenSymbol, enabled: settings.enabled, intervalHours: settings.intervalHours, settingsId: settings.id }).catch(() => null),
    ]);

    const sym = esc(settings.tokenSymbol);
    const name = esc(NAMES[settings.tokenSymbol.toUpperCase()] ?? settings.tokenSymbol);
    const now = new Date();
    const sum = (a: number[]) => a.reduce((t, x) => t + x, 0);
    const pct = (n: number, d = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}%`;
    const dur = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} zile` : `${h.toFixed(1)} ore`);

    // ---- base sets
    const real = lots.filter((l) => l.status !== "FAILED");
    const valid = real.filter((l) => l.status !== "CANCELLED");
    const filledLots = real.filter((l) => l.status === "FILLED");
    const openLots = real.filter((l) => l.status === "OPEN");
    const pendingLots = real.filter((l) => l.status === "PENDING_BUYBACK_ORDER");
    const cancelledN = lots.filter((l) => l.status === "CANCELLED").length;
    const failedN = lots.filter((l) => l.status === "FAILED").length;

    const sold = sum(real.map((l) => Number(l.usdcReceived)));
    const reinv = sum(real.map((l) => Number(l.usdcToBuyback)));
    const profit = sum(real.map((l) => Number(l.usdcProfit)));
    const tokSold = sum(real.map((l) => Number(l.tokenSold)));
    const avgSellPrice = tokSold > 0 ? sold / tokSold : 0;
    const tokBack = sum(filledLots.map((l) => Number(l.tokenReacquired ?? 0)));
    const tokSoldFilled = sum(filledLots.map((l) => Number(l.tokenSold)));
    const tokGain = tokBack - tokSoldFilled;
    const lockedUsd = sum([...openLots, ...pendingLots].map((l) => Number(l.usdcToBuyback)));
    const firstSale = real.length ? new Date(Math.min(...real.map((l) => l.soldAt.getTime()))) : null;
    const daysActive = firstSale ? Math.max(1, Math.round((now.getTime() - firstSale.getTime()) / DAY)) : 0;
    const vsAvg = price != null && avgSellPrice > 0 ? ((price - avgSellPrice) / avgSellPrice) * 100 : null;

    const hrs = filledLots
        .filter((l) => l.filledAt)
        .map((l) => (new Date(l.filledAt as Date).getTime() - new Date(l.buybackOrderCreatedAt ?? l.soldAt).getTime()) / 3_600_000)
        .filter((h) => Number.isFinite(h) && h >= 0)
        .sort((a, b) => a - b);
    const avgHrs = hrs.length ? sum(hrs) / hrs.length : null;
    const medHrs = hrs.length ? (hrs.length % 2 ? hrs[(hrs.length - 1) / 2] : (hrs[hrs.length / 2 - 1] + hrs[hrs.length / 2]) / 2) : null;

    // ---- months (14-month window)
    const months = Array.from({ length: 14 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 13 + i, 1));
    const mk = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
    const labels = months.map((d) => `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`);
    const soldBy = new Map<string, number>(), profBy = new Map<string, number>(), tokBy = new Map<string, number>(), cyclesBy = new Map<string, number>(), reinvBy = new Map<string, number>(), fillsBy = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    for (const l of real) {
        add(soldBy, mk(l.soldAt), Number(l.usdcReceived));
        add(cyclesBy, mk(l.soldAt), 1);
        add(reinvBy, mk(l.soldAt), Number(l.usdcToBuyback));
        add(tokBy, mk(l.soldAt), Number(l.tokenSold));
        if (l.status === "FILLED" && l.filledAt) {
            add(profBy, mk(l.filledAt), Number(l.usdcProfit));
            add(fillsBy, mk(l.filledAt), 1);
        }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const soldVals = months.map((d) => r2(soldBy.get(mk(d)) ?? 0));
    const profVals = months.map((d) => r2(profBy.get(mk(d)) ?? 0));
    const cyclesVals = months.map((d) => cyclesBy.get(mk(d)) ?? 0);
    const reinvVals = months.map((d) => reinvBy.get(mk(d)) ?? 0);
    const fillsVals = months.map((d) => fillsBy.get(mk(d)) ?? 0);
    const curIdx = months.length - 1;
    const bestIdx = profVals.some((v) => v > 0) ? profVals.indexOf(Math.max(...profVals)) : -1;
    const activeM = cyclesVals.filter((x) => x > 0).length || 1;
    const dot = (c: string) => `<i class="dot" style="background:${c}"></i>`;

    // last 30 days
    const since = now.getTime() - 30 * DAY;
    const profit30 = sum(filledLots.filter((l) => l.filledAt && l.filledAt.getTime() >= since).map((l) => Number(l.usdcProfit)));
    const sold30 = sum(real.filter((l) => l.soldAt.getTime() >= since).map((l) => Number(l.usdcReceived)));
    const cycles30 = real.filter((l) => l.soldAt.getTime() >= since).length;
    // the 30 days before those
    const since60 = now.getTime() - 60 * DAY;
    const inPrev = (d: Date | null) => !!d && d.getTime() >= since60 && d.getTime() < since;
    const profitPrev = sum(filledLots.filter((l) => inPrev(l.filledAt)).map((l) => Number(l.usdcProfit)));
    const soldPrev = sum(real.filter((l) => inPrev(l.soldAt)).map((l) => Number(l.usdcReceived)));
    const cyclesPrev = real.filter((l) => inPrev(l.soldAt)).length;
    const fills30 = filledLots.filter((l) => l.filledAt && l.filledAt.getTime() >= since).length;
    const fillsPrev = filledLots.filter((l) => inPrev(l.filledAt)).length;
    const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
    const deltaChip = (cur: number, prev: number) => {
        const d = delta(cur, prev);
        if (d === null) return `<span class="chip flat">${cur > 0 ? "nou" : "—"}</span>`;
        return `<span class="chip ${d > 0.05 ? "up" : d < -0.05 ? "down" : "flat"}">${pct(d)}</span>`;
    };
    const cmpRow = (label: string, cur: number, prev: number, fmt: (n: number) => string) => {
        const mx = Math.max(cur, prev, 0.0001);
        return `<div class="cmp"><div class="cmp-h"><span class="k">${label}</span>${deltaChip(cur, prev)}</div>
<div class="cmp-b"><span class="cmp-l">Ultimele 30 z</span><div class="bar"><i style="width:${Math.round((cur / mx) * 100)}%"></i></div><b>${fmt(cur)}</b></div>
<div class="cmp-b prev"><span class="cmp-l">30 z anterioare</span><div class="bar"><i style="width:${Math.round((prev / mx) * 100)}%"></i></div><b>${fmt(prev)}</b></div></div>`;
    };
    const compareHtml = `<div class="grid g2">${cmpRow("Profit realizat", profit30, profitPrev, usd)}${cmpRow("Total vândut", sold30, soldPrev, usd)}${cmpRow("Cicluri deschise", cycles30, cyclesPrev, (n) => String(n))}${cmpRow("Răscumpărări finalizate", fills30, fillsPrev, (n) => String(n))}</div>`;

    // ---- charts
    const moneyTips: (TipRow[] | null)[] = months.map((d, i) =>
        cyclesVals[i] > 0 || profVals[i] > 0
            ? [
                  ["Vândut", usd(soldVals[i]), "#e8bc70"],
                  ["Profit realizat", usd(profVals[i]), "#4ade80"],
                  ...SPLIT.map((p) => [`${p.name} (${p.pct}%)`, usd((profVals[i] * p.pct) / 100)] as TipRow),
                  ["Cicluri vândute", String(cyclesVals[i])],
                  ["Reinvestit în ordine", usd(reinvVals[i])],
                  ["Răscumpărări finalizate", String(fillsVals[i])],
                  ["Preț mediu vânzare", tokBy.get(mk(d)) ? usd(soldVals[i] / (tokBy.get(mk(d)) as number)) : "—"],
              ]
            : null,
    );
    const monthlyChart = barChart(labels, [
        { name: "Vândut", color: "#e8bc70", values: soldVals },
        { name: "Profit realizat", color: "#4ade80", values: profVals },
    ], { key: "a", tips: moneyTips }) + `<div class="legend"><span>${dot("#e8bc70")}Vândut</span><span>${dot("#4ade80")}Profit realizat</span></div>`;

    const part = (v: number, pc: number) => (v * pc) / 100;
    const moneyRows = months.map((_, i) => i).filter((i) => cyclesVals[i] > 0 || profVals[i] > 0).reverse().map((i) => [
        `<b>${labels[i]}</b>`, String(cyclesVals[i]), usd(soldVals[i]), usd(reinvVals[i]), fillsVals[i] ? String(fillsVals[i]) : "—",
        profVals[i] > 0 ? `<span class="pos">${usd(profVals[i])}</span>` : "—",
        ...SPLIT.map((p) => (profVals[i] > 0 ? usd(part(profVals[i], p.pct)) : "—")),
    ]);
    const monthlyTable = monthTable(
        ["Luna", "Cicluri", "Vândut", "Reinvestit", "Răscumpărări", "Profit", ...SPLIT.map((p) => `${p.name} ${p.pct}%`)],
        moneyRows,
        [["Total", String(sum(cyclesVals)), usd(sum(soldVals)), usd(sum(reinvVals)), String(sum(fillsVals)), `<span class="pos">${usd(sum(profVals))}</span>`, ...SPLIT.map((p) => usd(part(sum(profVals), p.pct)))]],
        ["Medie / lună activă", (sum(cyclesVals) / activeM).toFixed(1), usd(sum(soldVals) / activeM), usd(sum(reinvVals) / activeM), (sum(fillsVals) / activeM).toFixed(1), usd(sum(profVals) / activeM), ...SPLIT.map((p) => usd(part(sum(profVals) / activeM, p.pct)))],
    );
    const splitCards = `<div class="grid g2 splitc">${SPLIT.map((p, n) => `<div class="card tile ${n ? "b" : "g"}"><div class="k">${esc(p.name)} · ${p.pct}%</div><div class="v">${usd(part(profit, p.pct))}</div><div class="s">din profitul total · luna aceasta ${usd(part(profVals[curIdx], p.pct))} · 30 zile ${usd(part(profit30, p.pct))}</div></div>`).join("")}</div>`;

    // cumulative since the first sale (max 24 months)
    let cumHtml = "";
    if (firstSale) {
        const start = new Date(Math.max(new Date(firstSale.getFullYear(), firstSale.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() - 23, 1).getTime()));
        const span: Date[] = [];
        for (let d = new Date(start); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) span.push(new Date(d));
        if (span.length >= 2) {
            let cs = 0, cp = 0;
            const preS = real.filter((l) => l.soldAt < start).reduce((t, l) => t + Number(l.usdcReceived), 0);
            const preP = filledLots.filter((l) => l.filledAt && l.filledAt < start).reduce((t, l) => t + Number(l.usdcProfit), 0);
            cs = preS; cp = preP;
            const cumSold: number[] = [], cumProf: number[] = [];
            for (const d of span) {
                cs += soldBy.get(mk(d)) ?? 0;
                cp += profBy.get(mk(d)) ?? 0;
                cumSold.push(r2(cs));
                cumProf.push(r2(cp));
            }
            cumHtml = areaChart(span.map((d) => `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`), [
                { name: "Vândut cumulativ", color: "#e8bc70", values: cumSold },
                { name: "Profit cumulativ", color: "#4ade80", values: cumProf },
            ], { key: "c" }) + `<div class="legend"><span>${dot("#e8bc70")}Vândut cumulativ</span><span>${dot("#4ade80")}Profit cumulativ</span></div>`;
        }
    }

    // orders per month
    const placedBy = new Map<string, number>(), filledBy = new Map<string, number>(), activeBy = new Map<string, number>(), usdBy = new Map<string, number>();
    for (const l of valid) {
        const k = mk(l.soldAt);
        add(placedBy, k, 1);
        add(usdBy, k, Number(l.usdcReceived));
        if (l.status === "FILLED") add(filledBy, k, 1); else add(activeBy, k, 1);
    }
    const placedVals = months.map((d) => placedBy.get(mk(d)) ?? 0);
    const filledVals = months.map((d) => filledBy.get(mk(d)) ?? 0);
    const activeVals = months.map((d) => activeBy.get(mk(d)) ?? 0);
    const usdVals = months.map((d) => usdBy.get(mk(d)) ?? 0);
    const activeMonths = placedVals.filter((x) => x > 0).length;
    const avgPlaced = activeMonths ? sum(placedVals) / activeMonths : 0;
    const avgFilled = activeMonths ? sum(filledVals) / activeMonths : 0;
    const rate = (f: number, p: number) => (p ? `${Math.round((f / p) * 100)}%` : "—");
    const ordersChart = valid.length === 0 ? "" : barChart(labels, [
        { name: "Ordine plasate", color: "#e8bc70", values: placedVals },
        { name: "Răscumpărate", color: "#34d399", values: filledVals },
    ], {
        key: "b", int: true, valueLabel: (v) => String(v),
        tips: months.map((_, i) => placedVals[i] > 0 ? ([
            ["Ordine plasate", String(placedVals[i]), "#e8bc70"],
            ["Răscumpărate", String(filledVals[i]), "#34d399"],
            ["Încă active", String(activeVals[i])],
            ["Rată răscumpărare", rate(filledVals[i], placedVals[i])],
            ["Sumă totală vândută", usd(usdVals[i])],
            ["Sumă medie / ordin", usd(usdVals[i] / placedVals[i])],
        ] as TipRow[]) : null),
        lines: [
            { y: r2(avgPlaced), color: "#e8bc70", label: `Medie plasate ${avgPlaced.toFixed(1)}/lună` },
            { y: r2(avgFilled), color: "#4ade80", label: `Medie răscumpărate ${avgFilled.toFixed(1)}/lună` },
        ],
    }) + `<div class="legend"><span>${dot("#e8bc70")}Ordine plasate</span><span>${dot("#34d399")}Răscumpărate</span></div>`;
    const orderRows = months.map((_, i) => i).filter((i) => placedVals[i] > 0).reverse().map((i) => [
        `<b>${labels[i]}</b>`, String(placedVals[i]), filledVals[i] ? `<span class="pos">${filledVals[i]}</span>` : "0", String(activeVals[i]), rate(filledVals[i], placedVals[i]), usd(usdVals[i] / placedVals[i]),
    ]);
    const ordersTable = ordersChart ? monthTable(
        ["Luna", "Plasate", "Răscumpărate", "Încă active", "Rată", "Sumă medie / ordin"], orderRows,
        [["Total", String(sum(placedVals)), String(sum(filledVals)), String(sum(activeVals)), rate(sum(filledVals), sum(placedVals)), usd(sum(usdVals) / (sum(placedVals) || 1))]],
        ["Medie / lună activă", avgPlaced.toFixed(1), avgFilled.toFixed(1), (sum(activeVals) / (activeMonths || 1)).toFixed(1), "", ""],
    ) : "";

    // price history: sell vs buy-back target per cycle (last 40, oldest → newest)
    const recent = [...real].sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime()).slice(-40);
    const priceChart = recent.length >= 2
        ? lineChart(
              recent.map((l) => `${l.soldAt.getDate()} ${MONTHS[l.soldAt.getMonth()]}`),
              [
                  { name: "Preț vânzare", color: "#e8bc70", values: recent.map((l) => Number(l.sellPriceUsd)) },
                  { name: "Țintă răscumpărare", color: "#4ade80", dashed: true, values: recent.map((l) => (l.targetPriceUsd ? Number(l.targetPriceUsd) : null)) },
              ],
              { key: "p", ref: price != null ? { y: price, color: "#7cc4ff", label: `Preț curent ${usd(price)}` } : undefined },
          ) + `<div class="legend"><span>${dot("#e8bc70")}Preț vânzare</span><span>${dot("#4ade80")}Țintă răscumpărare</span>${price != null ? `<span>${dot("#7cc4ff")}Preț curent</span>` : ""}</div>`
        : "";

    // time to buy back by drop % (filled only)
    const dropB = new Map<number, number[]>();
    for (const l of filledLots) {
        const sp = Number(l.sellPriceUsd), tp = Number(l.targetPriceUsd ?? 0);
        if (!l.filledAt || !(sp > 0) || !(tp > 0)) continue;
        const h = (l.filledAt.getTime() - (l.buybackOrderCreatedAt ?? l.soldAt).getTime()) / 3_600_000;
        if (!Number.isFinite(h) || h < 0) continue;
        const d = Math.round(((sp - tp) / sp) * 100);
        dropB.set(d, [...(dropB.get(d) ?? []), h]);
    }
    const dropKeys = [...dropB.keys()].sort((a, b) => a - b);
    const dropChart = dropKeys.length
        ? barChart(dropKeys.map((k) => `${k}%`), [{ name: "Timp mediu", color: "#2dd4bf", values: dropKeys.map((k) => r2(sum(dropB.get(k)!) / dropB.get(k)!.length)) }], {
              key: "d", width: 460, yFmt: (v) => `${Math.round(v)}h`, valueLabel: (v) => (v >= 48 ? `${(v / 24).toFixed(1)}z` : `${v.toFixed(1)}h`),
              tips: dropKeys.map((k) => { const a = dropB.get(k)!; return [["Scădere țintă", `${k}%`], ["Timp mediu", dur(sum(a) / a.length), "#2dd4bf"], ["Cicluri", String(a.length)], ["Cel mai rapid", dur(Math.min(...a))], ["Cel mai lent", dur(Math.max(...a))]] as TipRow[]; }),
          })
        : "";

    // status donut
    const parts = [
        { label: "Răscumpărate", value: filledLots.length, color: "#4ade80" },
        { label: "Ordine active", value: openLots.length, color: "#e8bc70" },
        { label: "În curs", value: pendingLots.length, color: "#fb923c" },
        { label: "Anulate", value: cancelledN, color: "#6b7280" },
        { label: "Eșuate", value: failedN, color: "#f87171" },
    ];
    const donutHtml = lots.length ? `<div class="split">${donut(parts, { top: String(lots.length), bottom: "cicluri" })}<div class="dl">${parts.filter((p) => p.value > 0).map((p) => `<div><span>${dot(p.color)}${p.label}</span><b>${p.value} · ${Math.round((p.value / lots.length) * 100)}%</b></div>`).join("")}</div></div>` : "";

    // active orders with progress from the sell price down to the target
    const openCards = openLots
        .map((l) => {
            const sp = Number(l.sellPriceUsd), tp = Number(l.targetPriceUsd ?? 0);
            const prog = price != null && sp > tp && tp > 0 ? Math.max(0, Math.min(1, (sp - price) / (sp - tp))) : null;
            const left = price != null && tp > 0 ? (price > tp ? (tp / price - 1) * 100 : 0) : null;
            return { l, sp, tp, prog, left };
        })
        .sort((a, b) => (b.prog ?? -1) - (a.prog ?? -1))
        .map(({ l, sp, tp, prog, left }) => {
            const age = Math.max(0, (now.getTime() - (l.buybackOrderCreatedAt ?? l.soldAt).getTime()) / DAY);
            return `<div class="card oo"><div class="row"><span class="nm">${tok(Number(l.tokenSold))} ${sym}</span><span class="age">${age < 1 ? "azi" : `de ${Math.floor(age)} ${Math.floor(age) === 1 ? "zi" : "zile"}`}</span></div>
<div class="kv"><div><span class="k">Vândut la</span><b>${usd(sp)}</b></div><div><span class="k">Țintă</span><b style="color:var(--acc)">${tp > 0 ? usd(tp) : "—"}</b></div><div><span class="k">Rezervat</span><b>${usd(Number(l.usdcToBuyback))}</b></div></div>
<div class="bar"><i style="width:${prog === null ? 0 : Math.round(prog * 100)}%"></i></div>
<div class="bar-l"><span>${prog === null ? "preț indisponibil" : `${Math.round(prog * 100)}% din drum`}</span><span>${left === null ? "" : left === 0 ? "ținta e atinsă" : `încă ${pct(left)} până la țintă`}</span></div></div>`;
        })
        .join("");

    // ---- bot activity ("strike"): last 7 / 30 days
    const UP_COLOR: Record<string, string> = { ok: "#10b981", idle: "rgba(16,185,129,.28)", warn: "#fbbf24", error: "#ef4444", missed: "rgba(239,68,68,.45)", pending: "rgba(255,255,255,.25)", nodata: "rgba(255,255,255,.08)" };
    const UP_LABEL: Record<string, string> = { ok: "ordin executat", idle: "a rulat — niciun ordin scadent", warn: "fără combustibil", error: "eroare", missed: "botul nu a rulat", pending: "în așteptare", nodata: "fără date" };
    const strip = (days: { date: string; status: string }[], tall: boolean) => `<div class="strip${tall ? " tall" : ""}">${days.map((d) => `<i title="${esc(d.date)} · ${esc(UP_LABEL[d.status] ?? d.status)}" style="background:${UP_COLOR[d.status] ?? UP_COLOR.nodata}"></i>`).join("")}</div>`;
    const upPct = (v: number | null) => (v === null ? "—" : `${v >= 99.95 ? 100 : v.toFixed(1)}%`);
    const upCls = (v: number | null) => (v === null ? "m" : v >= 99 ? "pos" : v >= 90 ? "amb" : "neg");
    const upDetail = (w: { executed: number; opportunities: number; noFuel: number; unknown: number }) =>
        [`${w.executed}/${w.opportunities} execuții`, w.noFuel > 0 ? `${w.noFuel} fără combustibil` : "", w.unknown > 0 ? `${w.unknown} fără date` : ""].filter(Boolean).join(" · ");
    const strikeHtml = uptime
        ? `<div class="card"><h3>Activitatea botului · ${sym}</h3><p class="note">Fiecare bară este o zi (UTC). Procentul = ordine executate din zilele în care botul avea combustibil și un ordin de plasat.${uptime.enabled ? "" : " Botul este dezactivat acum."}</p>
<div class="strike"><div><div class="srow"><span class="k">Ultimele 7 zile</span><b class="${upCls(uptime.w7.pct)}">${upPct(uptime.w7.pct)}</b></div>${strip(uptime.days.slice(-7), true)}<div class="s">${esc(upDetail(uptime.w7))}</div></div>
<div><div class="srow"><span class="k">Ultimele 30 de zile</span><b class="${upCls(uptime.w30.pct)}">${upPct(uptime.w30.pct)}</b></div>${strip(uptime.days, true)}<div class="s">${esc(upDetail(uptime.w30))}</div></div></div>
<div class="legend">${Object.entries(UP_LABEL).filter(([k]) => k !== "pending").map(([k, v]) => `<span><i class="dot" style="background:${UP_COLOR[k]}"></i>${v}</span>`).join("")}</div></div>`
        : "";

    // ---- tiles
    const spark = (vals: number[], c: string) => sparkline(vals.slice(-12), c);
    const tile = (cls: string, k: string, v: string, sub: string, sp = "") => `<div class="card tile ${cls}">${sp}<div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
    const kpis = [
        tile("", "Total vândut", usd(sold), `${real.length} cicluri`, spark(soldVals, "#e8bc70")),
        tile("", `${sym} vândut`, tok(tokSold), avgSellPrice ? `preț mediu ${usd(avgSellPrice)}` : "—"),
        tile("g", "Profit luna aceasta", usd(profVals[curIdx]), labels[curIdx], spark(profVals, "#4ade80")),
        tile("g", "Profit · 30 zile", usd(profit30), delta(profit30, profitPrev) === null ? `${cycles30} cicluri · ${usd(sold30)} vândut` : `${pct(delta(profit30, profitPrev) as number)} față de cele 30 anterioare (${usd(profitPrev)})`),
        tile("", "Reinvestit în ordine", usd(reinv), sold > 0 ? `${((reinv / sold) * 100).toFixed(0)}% din vândut` : "—"),
        tile("g", "Profit / ciclu", filledLots.length ? usd(profit / filledLots.length) : "—", filledLots.length ? `din ${filledLots.length} răscumpărări` : "—"),
        tile("g", "Randament", sold > 0 ? `${((profit / sold) * 100).toFixed(1)}%` : "—", "profit raportat la suma vândută"),
        tile("a", "Ordine active", String(openLots.length + pendingLots.length), `${usd(lockedUsd)} blocați în ordine`),
        tile("", "Răscumpărări finalizate", String(filledLots.length), real.length ? `rată ${Math.round((filledLots.length / real.length) * 100)}%` : "—"),
        tile("b", `${sym} răscumpărat`, tok(tokBack), filledLots.length ? `${tokGain >= 0 ? "+" : "−"}${tok(Math.abs(tokGain))} ${sym} față de vândut` : "—"),
        tile("", "Timp mediu răscumpărare", avgHrs === null ? "—" : dur(avgHrs), medHrs === null ? "—" : `mediană ${dur(medHrs)}`),
        tile("", "Cea mai rapidă / lentă", hrs.length ? dur(hrs[0]) : "—", hrs.length ? `cea mai lentă ${dur(hrs[hrs.length - 1])}` : "—"),
        tile("", "Cea mai bună lună", bestIdx >= 0 ? usd(profVals[bestIdx]) : "—", bestIdx >= 0 ? labels[bestIdx] : "—"),
        tile("", "Activ de", firstSale ? `${daysActive} zile` : "—", real.length && firstSale ? `un ciclu la ~${(daysActive / real.length).toFixed(1)} zile` : "—"),
        tile("", "Anulate / eșuate", `${cancelledN} / ${failedN}`, "nu intră în statistici"),
        tile("b", "Preț curent", price != null ? usd(price) : "—", vsAvg === null ? "—" : `${pct(vsAvg)} față de media vânzărilor`),
    ].join("\n");

    // ---- cycles table with CSS-only filters
    const shown = lots.slice(0, 150);
    const rows = shown.map((l, idx) => {
        const [label, color] = STATUS[l.status] ?? [l.status, "#8b8b8b"];
        const sp = Number(l.sellPriceUsd), tp = Number(l.targetPriceUsd ?? 0);
        const pc = l.status === "OPEN" && price != null && sp > 0 ? ((price - sp) / sp) * 100 : null;
        const drop = sp > 0 && tp > 0 ? ((tp - sp) / sp) * 100 : null;
        const start = (l.buybackOrderCreatedAt ?? l.soldAt).getTime();
        const days = l.status === "FILLED" && l.filledAt ? (l.filledAt.getTime() - start) / DAY : l.status === "OPEN" || l.status === "PENDING_BUYBACK_ORDER" ? (now.getTime() - start) / DAY : null;
        return `<tr data-s="${l.status}" data-m="${mk(l.soldAt)}" data-p="${Math.floor(idx / PAGE_SIZE) + 1}"><td>${l.soldAt.toLocaleDateString("ro-RO")}</td><td><span class="pill" style="color:${color}">${label}</span></td>
<td>${tok(Number(l.tokenSold))}</td><td>${usd(sp)}</td><td>${usd(Number(l.usdcReceived))}</td>
<td class="pos">${usd(Number(l.usdcProfit))}</td><td>${tp > 0 ? usd(tp) : "—"}</td><td>${drop === null ? "—" : pct(drop)}</td>
<td>${pc === null ? "—" : `<span class="${pc <= 0 ? "pos" : "m"}">${pct(pc, 2)}</span>`}</td><td>${days === null ? "—" : days < 1 ? `${(days * 24).toFixed(0)} h` : `${days.toFixed(1)} z`}</td><td>${l.tokenReacquired ? tok(Number(l.tokenReacquired)) : "—"}</td></tr>`;
    }).join("");
    const statusCount = new Map<string, number>(), monthCount = new Map<string, number>();
    for (const l of shown) { add(statusCount, l.status, 1); add(monthCount, mk(l.soldAt), 1); }
    const statusKeys = Object.keys(STATUS).filter((k) => statusCount.has(k));
    const monthKeys = months.map((d) => mk(d)).filter((k) => monthCount.has(k)).reverse();
    const monthLabel = (k: string) => labels[months.findIndex((d) => mk(d) === k)];
    const on = "background:rgba(74,222,128,.12);color:var(--acc);border-color:rgba(74,222,128,.45)";
    const css = [
        ...statusKeys.map((k) => `#s-${k}:checked~.tw tbody tr:not([data-s="${k}"]){display:none}`),
        ...monthKeys.map((k) => `#m-${k}:checked~.tw tbody tr:not([data-m="${k}"]){display:none}`),
        `#s-all:checked~.chips label[for="s-all"],#m-all:checked~.chips label[for="m-all"]${[...statusKeys.map((k) => `,#s-${k}:checked~.chips label[for="s-${k}"]`), ...monthKeys.map((k) => `,#m-${k}:checked~.chips label[for="m-${k}"]`)].join("")}{${on}}`,
    ].join("");
    const pageCount = Math.ceil(shown.length / PAGE_SIZE);
    const pageCss = pageCount > 1
        ? Array.from({ length: pageCount }, (_, i) => `#s-all:checked~#m-all:checked~#p-${i + 1}:checked~.tw tbody tr:not([data-p="${i + 1}"]){display:none}#p-${i + 1}:checked~.pager label[for="p-${i + 1}"]{${on}}`).join("") + `#s-all:not(:checked)~.pager,#m-all:not(:checked)~.pager{display:none}`
        : "";
    const pageRadios = pageCount > 1 ? Array.from({ length: pageCount }, (_, i) => `<input class="fr" type="radio" name="p" id="p-${i + 1}"${i === 0 ? " checked" : ""}>`).join("") : "";
    const pager = pageCount > 1 ? `<div class="pager"><span class="k">Pagina</span>${Array.from({ length: pageCount }, (_, i) => `<label for="p-${i + 1}">${i + 1}</label>`).join("")}<span class="m">${PAGE_SIZE} cicluri pe pagină</span></div>` : "";
    const radios = `<input class="fr" type="radio" name="s" id="s-all" checked>${statusKeys.map((k) => `<input class="fr" type="radio" name="s" id="s-${k}">`).join("")}<input class="fr" type="radio" name="m" id="m-all" checked>${monthKeys.map((k) => `<input class="fr" type="radio" name="m" id="m-${k}">`).join("")}${pageRadios}`;
    const chips = `<div class="chips"><div class="cg"><span class="k">Status</span><label for="s-all">Toate (${shown.length})</label>${statusKeys.map((k) => `<label for="s-${k}">${STATUS[k][0]} (${statusCount.get(k)})</label>`).join("")}</div>${monthKeys.length > 1 ? `<div class="cg"><span class="k">Luna vânzării</span><label for="m-all">Toate</label>${monthKeys.map((k) => `<label for="m-${k}">${esc(monthLabel(k))} (${monthCount.get(k)})</label>`).join("")}</div>` : ""}</div>`;

    // ---- compose
    const priceChip = vsAvg === null ? "" : `<span class="chip ${vsAvg > 0.05 ? "up" : vsAvg < -0.05 ? "down" : "flat"}">${pct(vsAvg)} vs. media vânzărilor</span>`;
    const body = `<div class="nav"><span class="brand"><i></i>${sym}</span><a class="l" href="#rezumat">Rezumat</a>${uptime ? '<a class="l" href="#strike">Activitate</a>' : ""}<a class="l" href="#comparatie">30 vs 30</a><a class="l" href="#evolutie">Evoluție</a>${openCards ? '<a class="l" href="#ordine">Ordine active</a>' : ""}<a class="l" href="#luni">Pe luni</a><a class="l" href="#cicluri">Cicluri</a><span class="live"><b></b>date live</span></div>
<div class="hero" id="rezumat">
<div class="hero-top"><div class="ident"><div class="badge">${sym.slice(0, 4)}</div><div><h1>${name} · Reverse-DCA</h1><p class="sub">Vânzări, ordine de răscumpărare și profit · actualizat ${now.toLocaleString("ro-RO")}</p></div></div>
<div class="price"><div class="k">Preț curent</div><div class="big">${price != null ? usd(price) : "—"}</div>${priceChip}</div></div>
<div class="hero-stats">
<div class="hs main"><div class="k">Profit realizat</div><div class="v">${usd(profit)}</div><div class="s">${usd(profit30)} în ultimele 30 de zile${delta(profit30, profitPrev) === null ? "" : ` · ${pct(delta(profit30, profitPrev) as number)} vs. anterioarele`}</div></div>
<div class="hs"><div class="k">Total vândut</div><div class="v">${usd(sold)}</div><div class="s">${real.length} cicluri</div></div>
<div class="hs"><div class="k">Răscumpărări</div><div class="v">${filledLots.length}</div><div class="s">${real.length ? `rată ${Math.round((filledLots.length / real.length) * 100)}%` : "—"}</div></div>
<div class="hs"><div class="k">Ordine active</div><div class="v" style="color:var(--amb)">${openLots.length + pendingLots.length}</div><div class="s">${usd(lockedUsd)} blocați</div></div>
</div></div>
<div class="section"><h2>Cifre cheie</h2><div class="grid g4">${kpis}</div></div>
${strikeHtml ? `<div class="section" id="strike"><h2>Activitatea botului</h2>${strikeHtml}</div>` : ""}
<div class="section" id="comparatie"><h2>Ultimele 30 de zile vs. cele anterioare</h2><div class="card"><p class="note">Profitul se numără în luna în care s-a executat răscumpărarea; vânzările și ciclurile, după data vânzării.</p>${compareHtml}</div></div>
<div class="section" id="evolutie"><h2>Evoluție</h2><div class="grid g2">
${cumHtml ? `<div class="card" style="grid-column:1/-1"><h3>Vândut și profit, cumulativ</h3><p class="note">Cât s-a vândut și cât profit s-a acumulat de la primul ciclu. Profitul apare în luna în care s-a executat răscumpărarea.</p>${cumHtml}</div>` : ""}
${priceChart ? `<div class="card" style="grid-column:1/-1"><h3>Prețul vânzărilor față de țintele de răscumpărare</h3><p class="note">Ultimele ${recent.length} cicluri: la ce preț s-a vândut și la ce preț s-a pus ordinul de răscumpărare.</p>${priceChart}</div>` : ""}
${donutHtml ? `<div class="card"><h3>Starea ciclurilor</h3><p class="note">Cum se împart toate ciclurile până acum.</p>${donutHtml}</div>` : ""}
${dropChart ? `<div class="card"><h3>Timp până la răscumpărare, pe procent de scădere</h3><p class="note">Cât durează în medie până se execută ordinul, în funcție de cât sub prețul de vânzare a fost pus.</p>${dropChart}</div>` : ""}
</div></div>
${openCards ? `<div class="section" id="ordine"><h2>Ordine active · ${openLots.length}</h2><div class="open-grid">${openCards}</div></div>` : ""}
<div class="section" id="luni"><h2>Pe luni</h2><div class="grid">
${splitCards}
<div class="card"><h3>Vândut și profit pe lună</h3><p class="note">Ultimele 14 luni, în USDC. Profitul este împărțit ${SPLIT.map((p) => `${esc(p.name)} ${p.pct}%`).join(" · ")}.</p>${monthlyChart}${monthlyTable}</div>
${ordersChart ? `<div class="card"><h3>Ordine pe lună</h3><p class="note">Câte cicluri s-au deschis în fiecare lună și câte s-au răscumpărat deja — fără cele anulate sau eșuate. Liniile punctate sunt mediile pe lunile cu ordine.</p>${ordersChart}${ordersTable}</div>` : ""}
</div></div>
<div class="section" id="cicluri"><h2>Cicluri</h2><div class="card"><style>${css}${pageCss}</style><h3>Vânzare → răscumpărare</h3><p class="note">${lots.length > shown.length ? `Ultimele ${shown.length} din ${lots.length}.` : `${lots.length} cicluri.`} Filtrează după status sau după luna vânzării (cu un filtru activ se văd toate rezultatele, fără pagini).</p>
${radios}${chips}${pager}
<div class="tw"><table><thead><tr><th>Data</th><th>Status</th><th>Vândut</th><th>Preț vânzare</th><th>Încasat</th><th>Profit</th><th>Țintă răscump.</th><th>Scădere țintă</th><th>Față de vânzare</th><th>Durată</th><th>Răscumpărat</th></tr></thead><tbody>${rows || `<tr><td colspan="11" class="m">Niciun ciclu încă.</td></tr>`}</tbody></table></div></div></div>
<p class="ft">Pagină doar pentru citire · valorile sunt în USDC · nu conține adrese, tranzacții sau retrageri.<br>Date actualizate la fiecare deschidere a paginii.</p>`;
    return page(`${settings.tokenSymbol} · Statistici`, body);
}
