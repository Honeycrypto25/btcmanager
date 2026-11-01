import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTokenPriceUsd } from "@/lib/polygon/oneinch";
import { USDC_ADDRESS } from "@/lib/polygon/constants";
import { readVisitor } from "@/lib/share/visitor";

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

const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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

function page(title: string, body: string, status = 200) {
    const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>
:root{color-scheme:dark;--bg:#0b0b0b;--card:#141414;--line:#262626;--fg:#ececec;--mut:#9a9a9a;--acc:#4ade80;--amb:#e8bc70}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px;font-weight:600}.sub{color:var(--mut);font-size:13px;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:12px}@media(max-width:900px){.grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:520px){.grid{grid-template-columns:repeat(2,1fr)}}.tile{display:flex;flex-direction:column;padding:14px}.tile .k{line-height:1.3;min-height:2.6em}.tile .v{margin-top:6px;line-height:1.1;font-size:21px}.tile .s{color:var(--mut);font-size:11px;margin-top:6px;line-height:1.3;min-height:1.3em}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.card h2{font-size:14px;margin:0 0 4px;font-weight:600}
.k{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.v{font-size:22px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.note{color:var(--mut);font-size:12px;margin:0 0 12px}svg{width:100%;height:auto;display:block}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;min-width:760px}th{color:var(--mut);font-size:11px;text-transform:uppercase;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid #1d1d1d;white-space:nowrap;font-variant-numeric:tabular-nums}.pill{border:1px solid currentColor;border-radius:99px;padding:1px 8px;font-size:11px}
.mt{margin-top:14px}.mtab{min-width:0;font-size:13px}.mtab th.r,.mtab td.r{text-align:right}.mtab tbody tr:hover{background:#181818}.mtab tfoot td{border-top:1px solid var(--line);border-bottom:0;font-weight:600;color:var(--fg)}.mtab tfoot tr.avg td{font-weight:400;color:var(--mut)}.dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:8px}.m{color:var(--mut)}.fr{position:absolute;opacity:0;pointer-events:none}.chips{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}.cg{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.cg .k{margin-right:4px}.chips label{border:1px solid var(--line);border-radius:99px;padding:3px 11px;font-size:12px;color:var(--mut);cursor:pointer;user-select:none}.chips label:hover{border-color:#3a3a3a;color:var(--fg)}
.ft{color:#6b6b6b;font-size:11px;text-align:center;margin-top:24px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
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

type BarSeries = { name: string; color: string; values: number[] };
type RefLine = { y: number; color: string; label: string };
type TipRow = [label: string, value: string, color?: string];
type ChartOpts = { key: string; int?: boolean; lines?: RefLine[]; tips?: (TipRow[] | null)[] };
function barChart(labels: string[], series: BarSeries[], opts: ChartOpts): string {
    const W = 760, H = 240, L = 48, R = 8, T = 10, B = 28;
    const max = Math.max(1, ...series.flatMap((s) => s.values), ...(opts.lines ?? []).map((l) => l.y));
    let top: number;
    if (opts.int) top = Math.max(4, Math.ceil(max / 4) * 4);
    else {
        const nice = Math.pow(10, Math.floor(Math.log10(max)));
        top = Math.ceil(max / nice) * nice;
    }
    const innerW = W - L - R, innerH = H - T - B;
    const group = innerW / labels.length;
    const bw = Math.min(22, (group * 0.8) / series.length);
    const k = opts.key;
    let g = "";
    for (let i = 0; i <= 4; i++) {
        const y = T + innerH - (innerH * i) / 4;
        const tv = (top * i) / 4;
        g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#262626" stroke-dasharray="3 3"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" fill="#8b8b8b" font-size="10">${opts.int ? Math.round(tv) : `$${Math.round(tv)}`}</text>`;
    }
    (opts.lines ?? []).forEach((ln, n) => {
        const y = T + innerH - (ln.y / top) * innerH;
        g += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ln.color}" stroke-dasharray="5 4"/><text x="${L + 6}" y="${(n === 0 ? y - 4 : y + 13).toFixed(1)}" fill="${ln.color}" font-size="10">${esc(ln.label)}</text>`;
    });
    // Columns layer (hover targets + bars), then a tooltip layer on top. Tooltips show via CSS :hover on the
    // matching column (general-sibling selector) — no script needed, which the page's CSP wouldn't allow anyway.
    let cols = "", tips = "", css = "";
    labels.forEach((lb, i) => {
        const cx = L + group * i + group / 2;
        let bars = "";
        series.forEach((s, j) => {
            const h = (s.values[i] / top) * innerH;
            if (h <= 0) return;
            const x = cx - (bw * series.length) / 2 + bw * j;
            bars += `<rect x="${x.toFixed(1)}" y="${(T + innerH - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${s.color}"/>`;
        });
        const rows = opts.tips?.[i] ?? null;
        cols += `<g class="${k}c${i}"><rect class="hl" x="${(L + group * i).toFixed(1)}" y="${T}" width="${group.toFixed(1)}" height="${innerH + B - 4}" fill="#fff" opacity="0"/>${bars}<text x="${cx}" y="${H - 8}" text-anchor="middle" fill="#8b8b8b" font-size="10">${esc(lb)}</text><rect x="${(L + group * i).toFixed(1)}" y="${T}" width="${group.toFixed(1)}" height="${innerH + B - 4}" fill="transparent"/></g>`;
        if (rows && rows.length) {
            const w = 210, lh = 16, h = 34 + rows.length * lh;
            const tx = cx + 14 + w <= W - R ? cx + 14 : cx - 14 - w;
            const ty = T + 2;
            tips += `<g class="${k}t${i}" style="display:none" pointer-events="none"><rect x="${tx.toFixed(1)}" y="${ty}" width="${w}" height="${h}" rx="8" fill="#1c1c1c" stroke="#3a3a3a"/><text x="${(tx + 12).toFixed(1)}" y="${ty + 20}" fill="#ececec" font-size="12" font-weight="600">${esc(lb)}</text>${rows
                .map(([label, value, color], n) => {
                    const y = ty + 40 + n * lh;
                    return `${color ? `<rect x="${(tx + 12).toFixed(1)}" y="${y - 8}" width="8" height="8" rx="2" fill="${color}"/>` : ""}<text x="${(tx + (color ? 26 : 12)).toFixed(1)}" y="${y}" fill="#9a9a9a" font-size="11">${esc(label)}</text><text x="${(tx + w - 12).toFixed(1)}" y="${y}" text-anchor="end" fill="#ececec" font-size="11" font-weight="600">${esc(value)}</text>`;
                })
                .join("")}</g>`;
            css += `.${k}c${i}:hover~.${k}t${i}{display:block!important}`;
        }
        css += `.${k}c${i}:hover .hl{opacity:.05}`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img"><style>${css}</style>${g}${cols}${tips}</svg>`;
}

/** Month-by-month breakdown table (newest first) with a totals row and optional extra footer rows. */
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
    if (!link || link.kind !== "POLYGON_TOKEN") return page("Link indisponibil", `<div class="card"><h1>Link indisponibil</h1><p class="sub">Linkul nu există sau a fost șters.</p></div>`, 404);
    if (link.revokedAt) return page("Link dezactivat", `<div class="card"><h1>Link dezactivat</h1><p class="sub">Accesul prin acest link a fost oprit.</p></div>`, 410);
    if (link.expiresAt && link.expiresAt < new Date()) return page("Link expirat", `<div class="card"><h1>Link expirat</h1><p class="sub">Acest link nu mai este valabil.</p></div>`, 410);

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
    if (!settings) return page("Indisponibil", `<div class="card"><h1>Indisponibil</h1><p class="sub">Datele nu mai sunt disponibile.</p></div>`, 404);
    const lots = await db.polygonTokenLot.findMany({
        where: { userId: link.userId, settingsId: link.settingsId },
        orderBy: { soldAt: "desc" },
    });
    const price = await getTokenPriceUsd(settings.tokenAddress, settings.tokenDecimals, USDC_ADDRESS).catch(() => null);

    const real = lots.filter((l) => l.status !== "FAILED");
    const sold = real.reduce((t, l) => t + Number(l.usdcReceived), 0);
    const reinv = real.reduce((t, l) => t + Number(l.usdcToBuyback), 0);
    const profit = real.reduce((t, l) => t + Number(l.usdcProfit), 0);
    const open = real.filter((l) => l.status === "OPEN").length;
    const filled = real.filter((l) => l.status === "FILLED").length;

    // 14-month window: sold per month (by sale date), profit per month (by buy-back fill date)
    const now = new Date();
    const months = Array.from({ length: 14 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 13 + i, 1));
    const mk = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
    const soldBy = new Map<string, number>(), profBy = new Map<string, number>();
    for (const l of real) {
        soldBy.set(mk(l.soldAt), (soldBy.get(mk(l.soldAt)) ?? 0) + Number(l.usdcReceived));
        if (l.status === "FILLED" && l.filledAt) profBy.set(mk(l.filledAt), (profBy.get(mk(l.filledAt)) ?? 0) + Number(l.usdcProfit));
    }
    const labels = months.map((d) => `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`);
    const soldVals = months.map((d) => Math.round((soldBy.get(mk(d)) ?? 0) * 100) / 100);
    const profVals = months.map((d) => Math.round((profBy.get(mk(d)) ?? 0) * 100) / 100);
    const sum = (a: number[]) => a.reduce((t, x) => t + x, 0);
    const dot = (c: string) => `<i class="dot" style="background:${c}"></i>`;

    // Per-month detail, bucketed by sale date (cycles, sold, reinvested) and by buy-back fill date (profit, fills).
    const tokBy = new Map<string, number>(), cyclesBy = new Map<string, number>(), reinvBy = new Map<string, number>(), fillsBy = new Map<string, number>();
    for (const l of real) {
        cyclesBy.set(mk(l.soldAt), (cyclesBy.get(mk(l.soldAt)) ?? 0) + 1);
        reinvBy.set(mk(l.soldAt), (reinvBy.get(mk(l.soldAt)) ?? 0) + Number(l.usdcToBuyback));
        tokBy.set(mk(l.soldAt), (tokBy.get(mk(l.soldAt)) ?? 0) + Number(l.tokenSold));
        if (l.status === "FILLED" && l.filledAt) fillsBy.set(mk(l.filledAt), (fillsBy.get(mk(l.filledAt)) ?? 0) + 1);
    }
    const cyclesVals = months.map((d) => cyclesBy.get(mk(d)) ?? 0);
    const reinvVals = months.map((d) => reinvBy.get(mk(d)) ?? 0);
    const fillsVals = months.map((d) => fillsBy.get(mk(d)) ?? 0);
    const moneyRows = months
        .map((_, i) => i)
        .filter((i) => cyclesVals[i] > 0 || profVals[i] > 0)
        .reverse()
        .map((i) => [
            `<b>${labels[i]}</b>`,
            String(cyclesVals[i]),
            usd(soldVals[i]),
            usd(reinvVals[i]),
            fillsVals[i] ? String(fillsVals[i]) : "—",
            profVals[i] > 0 ? `<span style="color:var(--acc)">${usd(profVals[i])}</span>` : "—",
        ]);
    const activeM = cyclesVals.filter((x) => x > 0).length || 1;
    const moneyTips: (TipRow[] | null)[] = months.map((d, i) =>
        cyclesVals[i] > 0 || profVals[i] > 0
            ? [
                  ["Vândut", usd(soldVals[i]), "#e8a13a"],
                  ["Profit realizat", usd(profVals[i]), "#4ade80"],
                  ["Cicluri vândute", String(cyclesVals[i])],
                  ["Reinvestit în ordine", usd(reinvVals[i])],
                  ["Răscumpărări finalizate", String(fillsVals[i])],
                  ["Preț mediu vânzare", tokBy.get(mk(d)) ? usd(soldVals[i] / (tokBy.get(mk(d)) as number)) : "—"],
              ]
            : null,
    );
    const chart = barChart(labels, [
        { name: "Vândut", color: "#e8a13a", values: soldVals },
        { name: "Profit realizat", color: "#4ade80", values: profVals },
    ], { key: "a", tips: moneyTips }) + `<div class="k" style="margin-top:12px">${dot("#e8a13a")}Vândut &nbsp; ${dot("#4ade80")}Profit realizat — pe luni</div>` + monthTable(
        ["Luna", "Cicluri", "Vândut", "Reinvestit", "Răscumpărări", "Profit"],
        moneyRows,
        [["Total", String(sum(cyclesVals)), usd(sum(soldVals)), usd(sum(reinvVals)), String(sum(fillsVals)), `<span style="color:var(--acc)">${usd(sum(profVals))}</span>`]],
        ["Medie / lună activă", (sum(cyclesVals) / activeM).toFixed(1), usd(sum(soldVals) / activeM), usd(sum(reinvVals) / activeM), (sum(fillsVals) / activeM).toFixed(1), usd(sum(profVals) / activeM)],
    );

    // Orders per month: cycles opened (by sale date) vs buy-backs already filled. Cancelled/failed left out.
    const valid = lots.filter((l) => l.status !== "FAILED" && l.status !== "CANCELLED");
    const placedBy = new Map<string, number>(), filledBy = new Map<string, number>(), activeBy = new Map<string, number>(), usdBy = new Map<string, number>();
    for (const l of valid) {
        const k = mk(l.soldAt);
        placedBy.set(k, (placedBy.get(k) ?? 0) + 1);
        usdBy.set(k, (usdBy.get(k) ?? 0) + Number(l.usdcReceived));
        if (l.status === "FILLED") filledBy.set(k, (filledBy.get(k) ?? 0) + 1);
        else activeBy.set(k, (activeBy.get(k) ?? 0) + 1);
    }
    const placedVals = months.map((d) => placedBy.get(mk(d)) ?? 0);
    const filledVals = months.map((d) => filledBy.get(mk(d)) ?? 0);
    const activeVals = months.map((d) => activeBy.get(mk(d)) ?? 0);
    const usdVals = months.map((d) => usdBy.get(mk(d)) ?? 0);
    const activeMonths = placedVals.filter((x) => x > 0).length;
    const avgPlaced = activeMonths ? sum(placedVals) / activeMonths : 0;
    const avgFilled = activeMonths ? sum(filledVals) / activeMonths : 0;
    const rate = (f: number, p: number) => (p ? `${Math.round((f / p) * 100)}%` : "—");
    const orderRows = months
        .map((_, i) => i)
        .filter((i) => placedVals[i] > 0)
        .reverse()
        .map((i) => [
            `<b>${labels[i]}</b>`,
            String(placedVals[i]),
            filledVals[i] ? `<span style="color:var(--acc)">${filledVals[i]}</span>` : "0",
            String(activeVals[i]),
            rate(filledVals[i], placedVals[i]),
            usd(usdVals[i] / placedVals[i]),
        ]);
    const ordersChart = valid.length === 0 ? "" : barChart(labels, [
        { name: "Ordine plasate", color: "#e8a13a", values: placedVals },
        { name: "Răscumpărate", color: "#22c55e", values: filledVals },
    ], {
        key: "b",
        int: true,
        tips: months.map((d, i) =>
            placedVals[i] > 0
                ? ([
                      ["Ordine plasate", String(placedVals[i]), "#e8a13a"],
                      ["Răscumpărate", String(filledVals[i]), "#22c55e"],
                      ["Încă active", String(activeVals[i])],
                      ["Rată răscumpărare", rate(filledVals[i], placedVals[i])],
                      ["Sumă totală vândută", usd(usdVals[i])],
                      ["Sumă medie / ordin", usd(usdVals[i] / placedVals[i])],
                  ] as TipRow[])
                : null,
        ),
        lines: [
            { y: Math.round(avgPlaced * 100) / 100, color: "#e8bc70", label: `Medie plasate ${avgPlaced.toFixed(1)}/lună` },
            { y: Math.round(avgFilled * 100) / 100, color: "#4ade80", label: `Medie răscumpărate ${avgFilled.toFixed(1)}/lună` },
        ],
    }) + `<div class="k" style="margin-top:12px">${dot("#e8a13a")}Ordine plasate &nbsp; ${dot("#22c55e")}Răscumpărate — pe luni</div>` + monthTable(
        ["Luna", "Plasate", "Răscumpărate", "Încă active", "Rată", "Sumă medie / ordin"],
        orderRows,
        [["Total", String(sum(placedVals)), String(sum(filledVals)), String(sum(activeVals)), rate(sum(filledVals), sum(placedVals)), usd(sum(usdVals) / (sum(placedVals) || 1))]],
        ["Medie / lună activă", avgPlaced.toFixed(1), avgFilled.toFixed(1), (sum(activeVals) / (activeMonths || 1)).toFixed(1), "", ""],
    );

    const shown = lots.slice(0, 100);
    const rows = shown.map((l) => {
        const [label, color] = STATUS[l.status] ?? [l.status, "#8b8b8b"];
        const sp = Number(l.sellPriceUsd);
        const pct = l.status === "OPEN" && price != null && sp > 0 ? ((price - sp) / sp) * 100 : null;
        return `<tr data-s="${l.status}" data-m="${mk(l.soldAt)}"><td>${l.soldAt.toLocaleDateString("ro-RO")}</td><td><span class="pill" style="color:${color}">${label}</span></td>
<td>${tok(Number(l.tokenSold))}</td><td>${usd(sp)}</td><td>${usd(Number(l.usdcReceived))}</td>
<td style="color:var(--acc)">${usd(Number(l.usdcProfit))}</td><td>${l.targetPriceUsd ? usd(Number(l.targetPriceUsd)) : "—"}</td>
<td>${pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}</td><td>${l.tokenReacquired ? tok(Number(l.tokenReacquired)) : "—"}</td></tr>`;
    }).join("");

    // Filters are pure CSS (hidden radios + :checked) — the page's CSP blocks scripts, and this keeps a
    // filter click from reloading the page (and from counting as a new visit).
    const statusCount = new Map<string, number>(), monthCount = new Map<string, number>();
    for (const l of shown) {
        statusCount.set(l.status, (statusCount.get(l.status) ?? 0) + 1);
        monthCount.set(mk(l.soldAt), (monthCount.get(mk(l.soldAt)) ?? 0) + 1);
    }
    const statusKeys = Object.keys(STATUS).filter((k) => statusCount.has(k));
    const monthKeys = months.map((d) => mk(d)).filter((k) => monthCount.has(k)).reverse();
    const monthLabel = (k: string) => labels[months.findIndex((d) => mk(d) === k)];
    const css = [
        ...statusKeys.map((k) => `#s-${k}:checked~.tw tbody tr:not([data-s="${k}"]){display:none}`),
        ...monthKeys.map((k) => `#m-${k}:checked~.tw tbody tr:not([data-m="${k}"]){display:none}`),
        `#s-all:checked~.chips label[for="s-all"],#m-all:checked~.chips label[for="m-all"]${[...statusKeys.map((k) => `,#s-${k}:checked~.chips label[for="s-${k}"]`), ...monthKeys.map((k) => `,#m-${k}:checked~.chips label[for="m-${k}"]`)].join("")}{background:#262626;color:var(--fg);border-color:#4a4a4a}`,
    ].join("");
    const radios = `<input class="fr" type="radio" name="s" id="s-all" checked>${statusKeys.map((k) => `<input class="fr" type="radio" name="s" id="s-${k}">`).join("")}<input class="fr" type="radio" name="m" id="m-all" checked>${monthKeys.map((k) => `<input class="fr" type="radio" name="m" id="m-${k}">`).join("")}`;
    const chips = `<div class="chips"><div class="cg"><span class="k">Status</span><label for="s-all">Toate (${shown.length})</label>${statusKeys.map((k) => `<label for="s-${k}" style="--c:${STATUS[k][1]}">${STATUS[k][0]} (${statusCount.get(k)})</label>`).join("")}</div>${monthKeys.length > 1 ? `<div class="cg"><span class="k">Luna vânzării</span><label for="m-all">Toate</label>${monthKeys.map((k) => `<label for="m-${k}">${esc(monthLabel(k))} (${monthCount.get(k)})</label>`).join("")}</div>` : ""}</div>`;

    // Extra GEODNET-specific figures for the top tiles
    const tokSold = real.reduce((t, l) => t + Number(l.tokenSold), 0);
    const avgSellPrice = tokSold > 0 ? sold / tokSold : 0;
    const filledLots = real.filter((l) => l.status === "FILLED");
    const tokBack = filledLots.reduce((t, l) => t + Number(l.tokenReacquired ?? 0), 0);
    const tokSoldFilled = filledLots.reduce((t, l) => t + Number(l.tokenSold), 0);
    const tokGain = tokBack - tokSoldFilled;
    const lockedUsd = real.filter((l) => l.status === "OPEN" || l.status === "PENDING_BUYBACK_ORDER").reduce((t, l) => t + Number(l.usdcToBuyback), 0);
    const hrs = filledLots
        .filter((l) => l.filledAt)
        .map((l) => (new Date(l.filledAt as Date).getTime() - new Date(l.buybackOrderCreatedAt ?? l.soldAt).getTime()) / 3_600_000)
        .filter((h) => Number.isFinite(h) && h >= 0);
    const dur = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} zile` : `${h.toFixed(1)} ore`);
    const avgHrs = hrs.length ? hrs.reduce((t, h) => t + h, 0) / hrs.length : null;
    const firstSale = real.length ? new Date(Math.min(...real.map((l) => l.soldAt.getTime()))) : null;
    const daysActive = firstSale ? Math.max(1, Math.round((Date.now() - firstSale.getTime()) / 86_400_000)) : 0;
    const vsAvg = price != null && avgSellPrice > 0 ? ((price - avgSellPrice) / avgSellPrice) * 100 : null;
    const curIdx = months.length - 1;
    const tile = (k: string, v: string, sub: string, color?: string) =>
        `<div class="card tile"><div class="k">${k}</div><div class="v"${color ? ` style="color:${color}"` : ""}>${v}</div><div class="s">${sub}</div></div>`;
    const tiles = [
        tile("Total vândut", usd(sold), `${real.length} cicluri`),
        tile(`${esc(settings.tokenSymbol)} vândut`, tok(tokSold), avgSellPrice ? `preț mediu ${usd(avgSellPrice)}` : "—"),
        tile("Preț curent", price != null ? usd(price) : "—", vsAvg === null ? "—" : `${vsAvg >= 0 ? "+" : ""}${vsAvg.toFixed(1)}% față de media vânzărilor`),
        tile("Reinvestit în ordine", usd(reinv), sold > 0 ? `${((reinv / sold) * 100).toFixed(0)}% din vândut` : "—"),
        tile("Profit realizat", usd(profit), filled ? `≈ ${usd(profit / real.length)} / ciclu` : "—", "var(--acc)"),
        tile("Profit luna aceasta", usd(profVals[curIdx]), labels[curIdx], "var(--acc)"),
        tile("Total cicluri", String(real.length), firstSale ? `din ${firstSale.toLocaleDateString("ro-RO")}` : "—"),
        tile("Ordine active", String(open), `${usd(lockedUsd)} blocați în ordine`),
        tile("Răscumpărări finalizate", String(filled), real.length ? `rată ${Math.round((filled / real.length) * 100)}%` : "—"),
        tile(`${esc(settings.tokenSymbol)} răscumpărat`, tok(tokBack), filled ? `${tokGain >= 0 ? "+" : ""}${tok(tokGain)} ${esc(settings.tokenSymbol)} față de vândut` : "—"),
        tile("Timp mediu răscumpărare", avgHrs === null ? "—" : dur(avgHrs), hrs.length ? `cea mai rapidă ${dur(Math.min(...hrs))}` : "—"),
        tile("Activ de", firstSale ? `${daysActive} zile` : "—", real.length && firstSale ? `un ciclu la ~${(daysActive / real.length).toFixed(1)} zile` : "—"),
    ].join("\n");

    const sym = esc(settings.tokenSymbol);
    const body = `<h1>${sym} · Statistici Reverse-DCA</h1>
<p class="sub">Vânzări, ordine de răscumpărare și profit pentru ${sym}${price != null ? ` · preț curent ${usd(price)}` : ""} · actualizat ${new Date().toLocaleString("ro-RO")}</p>
<div class="grid">
${tiles}
</div>
<div class="card" style="margin-bottom:16px"><h2>Vândut și profit pe lună</h2><p class="note">Ultimele 14 luni, în USDC. Profitul apare în luna în care s-a executat răscumpărarea.</p>${chart}</div>
${ordersChart ? `<div class="card" style="margin-bottom:16px"><h2>Ordine pe lună</h2><p class="note">Câte cicluri s-au deschis în fiecare lună (portocaliu) și câte s-au răscumpărat deja (verde) — ultimele 14 luni, fără cele anulate sau eșuate. Liniile punctate sunt mediile pe lunile cu ordine.</p>${ordersChart}</div>` : ""}
<div class="card"><style>${css}</style><h2>Cicluri (vânzare → răscumpărare)</h2><p class="note">${lots.length > shown.length ? `Ultimele ${shown.length} din ${lots.length}.` : `${lots.length} cicluri.`} Filtrează după status sau luna vânzării.</p>
${radios}${chips}
<div class="tw"><table><thead><tr><th>Data</th><th>Status</th><th>Vândut</th><th>Preț vânzare</th><th>Încasat</th><th>Profit</th><th>Țintă răscump.</th><th>Față de vânzare</th><th>Răscumpărat</th></tr></thead><tbody>${rows || `<tr><td colspan="9" style="color:var(--mut)">Niciun ciclu încă.</td></tr>`}</tbody></table></div></div>
<p class="ft">Pagină doar pentru citire. Valorile sunt în USDC.</p>`;
    return page(`${settings.tokenSymbol} · Statistici`, body);
}
