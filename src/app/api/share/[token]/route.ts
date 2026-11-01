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
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.card h2{font-size:14px;margin:0 0 4px;font-weight:600}
.k{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.v{font-size:22px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.note{color:var(--mut);font-size:12px;margin:0 0 12px}svg{width:100%;height:auto;display:block}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;min-width:760px}th{color:var(--mut);font-size:11px;text-transform:uppercase;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid #1d1d1d;white-space:nowrap;font-variant-numeric:tabular-nums}.pill{border:1px solid currentColor;border-radius:99px;padding:1px 8px;font-size:11px}
.leg{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px}.lg{background:#101010;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12px}.lg b{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:6px}.lg i{display:inline-block;width:10px;height:10px;border-radius:2px}.lg i.dash{height:0;width:14px;border-top:2px dashed currentColor;border-radius:0}.lg div{display:flex;justify-content:space-between;gap:10px;color:var(--mut);padding:1px 0}.lg div span:last-child{color:var(--fg);font-variant-numeric:tabular-nums;text-align:right}
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
type ChartOpts = { fmt?: (n: number) => string; int?: boolean; lines?: RefLine[] };
function barChart(labels: string[], series: BarSeries[], opts: ChartOpts = {}): string {
    const fmt = opts.fmt ?? usd;
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
    let g = "";
    for (let i = 0; i <= 4; i++) {
        const y = T + innerH - (innerH * i) / 4;
        const tv = (top * i) / 4;
        g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#262626" stroke-dasharray="3 3"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" fill="#8b8b8b" font-size="10">${opts.int ? Math.round(tv) : `$${Math.round(tv)}`}</text>`;
    }
    labels.forEach((lb, i) => {
        const cx = L + group * i + group / 2;
        g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" fill="#8b8b8b" font-size="10">${esc(lb)}</text>`;
        series.forEach((s, j) => {
            const h = (s.values[i] / top) * innerH;
            if (h <= 0) return;
            const x = cx - (bw * series.length) / 2 + bw * j;
            g += `<rect x="${x.toFixed(1)}" y="${(T + innerH - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${s.color}"><title>${esc(lb)} · ${esc(s.name)}: ${fmt(s.values[i])}</title></rect>`;
        });
    });
    (opts.lines ?? []).forEach((ln, k) => {
        const y = T + innerH - (ln.y / top) * innerH;
        g += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ln.color}" stroke-dasharray="5 4"/><text x="${L + 6}" y="${(k === 0 ? y - 4 : y + 13).toFixed(1)}" fill="${ln.color}" font-size="10">${esc(ln.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

type LegendItem = { color: string; name: string; dash?: boolean; rows: [string, string][] };
function legend(items: LegendItem[]): string {
    return `<div class="leg">${items
        .map((it) => `<div class="lg"><b style="color:${it.color}"><i${it.dash ? ' class="dash"' : ""} style="${it.dash ? "" : `background:${it.color}`}"></i><span style="color:var(--fg)">${esc(it.name)}</span></b>${it.rows
            .map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`)
            .join("")}</div>`)
        .join("")}</div>`;
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
    const activeAvg = (a: number[]) => { const n = a.filter((x) => x > 0).length; return n ? sum(a) / n : 0; };
    const best = (a: number[]): string => {
        const m = Math.max(...a);
        return m > 0 ? `${labels[a.indexOf(m)]} · ${usd(m)}` : "—";
    };
    const cur = months.length - 1;
    const chart = barChart(labels, [
        { name: "Vândut", color: "#e8a13a", values: soldVals },
        { name: "Profit realizat", color: "#4ade80", values: profVals },
    ]) + legend([
        { color: "#e8a13a", name: "Vândut", rows: [["Total 14 luni", usd(sum(soldVals))], ["Medie pe lună activă", usd(activeAvg(soldVals))], ["Cea mai bună lună", best(soldVals)], [`Luna curentă (${labels[cur]})`, usd(soldVals[cur])]] },
        { color: "#4ade80", name: "Profit realizat", rows: [["Total 14 luni", usd(sum(profVals))], ["Medie pe lună activă", usd(activeAvg(profVals))], ["Cea mai bună lună", best(profVals)], [`Luna curentă (${labels[cur]})`, usd(profVals[cur])]] },
    ]);

    // Orders per month: cycles opened (by sale date) vs buy-backs already filled. Cancelled/failed left out.
    const valid = lots.filter((l) => l.status !== "FAILED" && l.status !== "CANCELLED");
    const placedBy = new Map<string, number>(), filledBy = new Map<string, number>();
    for (const l of valid) {
        placedBy.set(mk(l.soldAt), (placedBy.get(mk(l.soldAt)) ?? 0) + 1);
        if (l.status === "FILLED") filledBy.set(mk(l.soldAt), (filledBy.get(mk(l.soldAt)) ?? 0) + 1);
    }
    const placedVals = months.map((d) => placedBy.get(mk(d)) ?? 0);
    const filledVals = months.map((d) => filledBy.get(mk(d)) ?? 0);
    const activeMonths = placedVals.filter((x) => x > 0).length;
    const avgPlaced = activeMonths ? sum(placedVals) / activeMonths : 0;
    const avgFilled = activeMonths ? sum(filledVals) / activeMonths : 0;
    const avgOrderUsd = valid.length ? valid.reduce((t, l) => t + Number(l.usdcReceived), 0) / valid.length : 0;
    const fillRate = sum(placedVals) ? (sum(filledVals) / sum(placedVals)) * 100 : 0;
    const bestOrders = (() => { const m = Math.max(...placedVals); return m > 0 ? `${labels[placedVals.indexOf(m)]} · ${m}` : "—"; })();
    const ordersChart = valid.length === 0 ? "" : barChart(labels, [
        { name: "Ordine plasate", color: "#e8a13a", values: placedVals },
        { name: "Răscumpărate", color: "#22c55e", values: filledVals },
    ], {
        int: true,
        fmt: (n) => String(n),
        lines: [
            { y: Math.round(avgPlaced * 100) / 100, color: "#e8bc70", label: `Medie plasate ${avgPlaced.toFixed(1)}/lună` },
            { y: Math.round(avgFilled * 100) / 100, color: "#4ade80", label: `Medie răscumpărate ${avgFilled.toFixed(1)}/lună` },
        ],
    }) + legend([
        { color: "#e8a13a", name: "Ordine plasate", rows: [["Total 14 luni", String(sum(placedVals))], ["Cea mai activă lună", bestOrders], [`Luna curentă (${labels[cur]})`, String(placedVals[cur])], ["Sumă medie per ordin", usd(avgOrderUsd)]] },
        { color: "#22c55e", name: "Răscumpărate", rows: [["Total 14 luni", String(sum(filledVals))], ["Rată de răscumpărare", `${fillRate.toFixed(0)}%`], [`Luna curentă (${labels[cur]})`, String(filledVals[cur])], ["Încă active", String(valid.filter((l) => l.status === "OPEN" || l.status === "PENDING_BUYBACK_ORDER").length)]] },
        { color: "#e8bc70", name: "Medie plasate / lună", dash: true, rows: [["Pe lunile cu ordine", `${avgPlaced.toFixed(1)} ordine`]] },
        { color: "#4ade80", name: "Medie răscumpărate / lună", dash: true, rows: [["Pe lunile cu ordine", `${avgFilled.toFixed(1)} ordine`]] },
    ]);

    const shown = lots.slice(0, 100);
    const rows = shown.map((l) => {
        const [label, color] = STATUS[l.status] ?? [l.status, "#8b8b8b"];
        const sp = Number(l.sellPriceUsd);
        const pct = l.status === "OPEN" && price != null && sp > 0 ? ((price - sp) / sp) * 100 : null;
        return `<tr><td>${l.soldAt.toLocaleDateString("ro-RO")}</td><td><span class="pill" style="color:${color}">${label}</span></td>
<td>${tok(Number(l.tokenSold))}</td><td>${usd(sp)}</td><td>${usd(Number(l.usdcReceived))}</td>
<td style="color:var(--acc)">${usd(Number(l.usdcProfit))}</td><td>${l.targetPriceUsd ? usd(Number(l.targetPriceUsd)) : "—"}</td>
<td>${pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}</td><td>${l.tokenReacquired ? tok(Number(l.tokenReacquired)) : "—"}</td></tr>`;
    }).join("");

    const sym = esc(settings.tokenSymbol);
    const body = `<h1>${sym} · Statistici Reverse-DCA</h1>
<p class="sub">Vânzări, ordine de răscumpărare și profit pentru ${sym}${price != null ? ` · preț curent ${usd(price)}` : ""} · actualizat ${new Date().toLocaleString("ro-RO")}</p>
<div class="grid">
<div class="card"><div class="k">Total vândut</div><div class="v">${usd(sold)}</div></div>
<div class="card"><div class="k">Reinvestit în ordine</div><div class="v">${usd(reinv)}</div></div>
<div class="card"><div class="k">Profit realizat</div><div class="v" style="color:var(--acc)">${usd(profit)}</div></div>
<div class="card"><div class="k">Ordine active</div><div class="v">${open}</div></div>
<div class="card"><div class="k">Răscumpărări finalizate</div><div class="v">${filled}</div></div>
<div class="card"><div class="k">Total cicluri</div><div class="v">${real.length}</div></div>
</div>
<div class="card" style="margin-bottom:16px"><h2>Vândut și profit pe lună</h2><p class="note">Ultimele 14 luni, în USDC. Profitul apare în luna în care s-a executat răscumpărarea.</p>${chart}</div>
${ordersChart ? `<div class="card" style="margin-bottom:16px"><h2>Ordine pe lună</h2><p class="note">Câte cicluri s-au deschis în fiecare lună (portocaliu) și câte s-au răscumpărat deja (verde) — ultimele 14 luni, fără cele anulate sau eșuate. Liniile punctate sunt mediile pe lunile cu ordine.</p>${ordersChart}</div>` : ""}
<div class="card"><h2>Cicluri (vânzare → răscumpărare)</h2><p class="note">${lots.length > shown.length ? `Ultimele ${shown.length} din ${lots.length}.` : `${lots.length} cicluri.`}</p>
<div class="tw"><table><thead><tr><th>Data</th><th>Status</th><th>Vândut</th><th>Preț vânzare</th><th>Încasat</th><th>Profit</th><th>Țintă răscump.</th><th>Față de vânzare</th><th>Răscumpărat</th></tr></thead><tbody>${rows || `<tr><td colspan="9" style="color:var(--mut)">Niciun ciclu încă.</td></tr>`}</tbody></table></div></div>
<p class="ft">Pagină doar pentru citire. Valorile sunt în USDC.</p>`;
    return page(`${settings.tokenSymbol} · Statistici`, body);
}
