/**
 * Inline-SVG chart helpers for the public share page. The page's CSP blocks scripts, so every chart is plain
 * SVG + CSS (hover tooltips via the :hover sibling selector). Gradient ids are prefixed with the chart key so
 * several charts can live on one page.
 */

export const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Mix a #rrggbb colour with white (t = 0..1) — the lighter top of a bar gradient. */
export function lighten(hex: string, t: number): string {
    const n = parseInt(hex.replace("#", ""), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * t);
    return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

const gradDef = (id: string, color: string, topT = 0.35, bottomOpacity = 0.72) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(color, topT)}"/><stop offset="1" stop-color="${color}" stop-opacity="${bottomOpacity}"/></linearGradient>`;

/** Rectangle with only the top corners rounded. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
    const rr = Math.max(0, Math.min(r, w / 2, h));
    return `M${x.toFixed(1)},${(y + h).toFixed(1)}L${x.toFixed(1)},${(y + rr).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + rr).toFixed(1)},${y.toFixed(1)}L${(x + w - rr).toFixed(1)},${y.toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + rr).toFixed(1)}L${(x + w).toFixed(1)},${(y + h).toFixed(1)}Z`;
}

function niceTop(max: number, int?: boolean): number {
    if (int) return Math.max(4, Math.ceil(max / 4) * 4);
    const nice = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
    return Math.ceil(max / nice) * nice;
}

export type BarSeries = { name: string; color: string; values: number[] };
export type RefLine = { y: number; color: string; label: string };
export type TipRow = [label: string, value: string, color?: string];
export type BarOpts = {
    key: string;
    int?: boolean;
    lines?: RefLine[];
    tips?: (TipRow[] | null)[];
    /** Print the value above each bar (use for charts with few bars). */
    valueLabel?: (v: number) => string;
    yFmt?: (v: number) => string;
    height?: number;
    /** viewBox width — use a smaller one (≈460) for charts shown in a half-width card so text keeps its size. */
    width?: number;
};

export function barChart(labels: string[], series: BarSeries[], opts: BarOpts): string {
    const W = opts.width ?? 760, H = opts.height ?? 250, L = 50, R = 10, T = 18, B = 28;
    const max = Math.max(1, ...series.flatMap((s) => s.values), ...(opts.lines ?? []).map((l) => l.y));
    const top = niceTop(max, opts.int);
    const innerW = W - L - R, innerH = H - T - B;
    const group = innerW / labels.length;
    const bw = Math.min(26, (group * 0.78) / series.length);
    const k = opts.key;
    const yFmt = opts.yFmt ?? ((v: number) => (opts.int ? String(Math.round(v)) : `$${Math.round(v)}`));
    let defs = series.map((s, j) => gradDef(`${k}g${j}`, s.color)).join("");
    let g = "";
    for (let i = 0; i <= 4; i++) {
        const y = T + innerH - (innerH * i) / 4;
        g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#ffffff" stroke-opacity="${i === 0 ? 0.18 : 0.06}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="#7d8590" font-size="10">${yFmt((top * i) / 4)}</text>`;
    }
    (opts.lines ?? []).forEach((ln, n) => {
        const y = T + innerH - (ln.y / top) * innerH;
        g += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ln.color}" stroke-opacity=".8" stroke-dasharray="5 4"/><text x="${L + 6}" y="${(n === 0 ? y - 5 : y + 13).toFixed(1)}" fill="${ln.color}" font-size="10">${esc(ln.label)}</text>`;
    });
    let cols = "", tips = "", css = "";
    labels.forEach((lb, i) => {
        const cx = L + group * i + group / 2;
        let bars = "";
        series.forEach((s, j) => {
            const v = s.values[i];
            const h = (v / top) * innerH;
            if (h <= 0) return;
            const x = cx - (bw * series.length) / 2 + bw * j;
            bars += `<path d="${topRounded(x + 1, T + innerH - h, bw - 2, h, 5)}" fill="url(#${k}g${j})"/>`;
            if (opts.valueLabel && series.length <= 2 && labels.length <= 16) {
                bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${(T + innerH - h - 5).toFixed(1)}" text-anchor="middle" fill="#c9d1d9" font-size="9.5" font-weight="600">${esc(opts.valueLabel(v))}</text>`;
            }
        });
        const rows = opts.tips?.[i] ?? null;
        cols += `<g class="${k}c${i}"><rect class="hl" x="${(L + group * i).toFixed(1)}" y="${T}" width="${group.toFixed(1)}" height="${innerH + B - 4}" rx="6" fill="#fff" opacity="0"/>${bars}<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#7d8590" font-size="10">${esc(lb)}</text><rect x="${(L + group * i).toFixed(1)}" y="${T}" width="${group.toFixed(1)}" height="${innerH + B - 4}" fill="transparent"/></g>`;
        if (rows && rows.length) {
            const w = 226, lh = 17, h = 38 + rows.length * lh;
            const tx = cx + 14 + w <= W - R ? cx + 14 : cx - 14 - w;
            const ty = T + 2;
            tips += `<g class="${k}t${i}" style="display:none" pointer-events="none"><rect x="${tx.toFixed(1)}" y="${ty}" width="${w}" height="${h}" rx="10" fill="#12151a" stroke="#ffffff" stroke-opacity=".14"/><text x="${(tx + 14).toFixed(1)}" y="${ty + 21}" fill="#f0f3f6" font-size="12" font-weight="700">${esc(lb)}</text>${rows
                .map(([label, value, color], n) => {
                    const y = ty + 42 + n * lh;
                    return `${color ? `<rect x="${(tx + 14).toFixed(1)}" y="${y - 8}" width="8" height="8" rx="2" fill="${color}"/>` : ""}<text x="${(tx + (color ? 28 : 14)).toFixed(1)}" y="${y}" fill="#8b949e" font-size="11">${esc(label)}</text><text x="${(tx + w - 14).toFixed(1)}" y="${y}" text-anchor="end" fill="#f0f3f6" font-size="11" font-weight="600">${esc(value)}</text>`;
                })
                .join("")}</g>`;
            css += `.${k}c${i}:hover~.${k}t${i}{display:block!important}`;
        }
        css += `.${k}c${i}:hover .hl{opacity:.06}`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs><style>${css}</style>${g}${cols}${tips}</svg>`;
}

export type AreaSeries = { name: string; color: string; values: number[] };

/** Cumulative-style area chart: one gradient-filled area + line per series, end-point marker with its value. */
export function areaChart(labels: string[], series: AreaSeries[], opts: { key: string; yFmt?: (v: number) => string; height?: number }): string {
    const W = 760, H = opts.height ?? 250, L = 56, R = 18, T = 16, B = 28;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const top = niceTop(max);
    const innerW = W - L - R, innerH = H - T - B;
    const n = labels.length;
    const xs = (i: number) => L + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const ys = (v: number) => T + innerH - (v / top) * innerH;
    const yFmt = opts.yFmt ?? ((v: number) => `$${Math.round(v)}`);
    const k = opts.key;
    let defs = "", g = "", body = "";
    for (let i = 0; i <= 4; i++) {
        const y = T + innerH - (innerH * i) / 4;
        g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#ffffff" stroke-opacity="${i === 0 ? 0.18 : 0.06}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="#7d8590" font-size="10">${yFmt((top * i) / 4)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 8));
    labels.forEach((lb, i) => {
        if (i === n - 1 || (i % step === 0 && n - 1 - i >= Math.max(1, Math.ceil(step * 0.7)))) g += `<text x="${xs(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#7d8590" font-size="10">${esc(lb)}</text>`;
    });
    series.forEach((s, j) => {
        defs += `<linearGradient id="${k}a${j}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".38"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
        const pts = s.values.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`);
        const area = `M${xs(0).toFixed(1)},${(T + innerH).toFixed(1)}L${pts.join("L")}L${xs(n - 1).toFixed(1)},${(T + innerH).toFixed(1)}Z`;
        const lastV = s.values[n - 1] ?? 0;
        const lx = xs(n - 1), ly = ys(lastV);
        body += `<path d="${area}" fill="url(#${k}a${j})"/><polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.5" fill="#0b0d10" stroke="${s.color}" stroke-width="2.2"/><text x="${(lx - 8).toFixed(1)}" y="${(ly - 10).toFixed(1)}" text-anchor="end" fill="${s.color}" font-size="11" font-weight="700">${esc(yFmt(lastV))}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs>${g}${body}</svg>`;
}

export type LinePoint = { label: string; values: (number | null)[] };

/** Multi-line price chart (x evenly spaced), with an optional dashed horizontal reference (current price). */
export function lineChart(
    labels: string[],
    series: { name: string; color: string; dashed?: boolean; values: (number | null)[] }[],
    opts: { key: string; ref?: { y: number; color: string; label: string }; yFmt?: (v: number) => string; height?: number },
): string {
    const W = 760, H = opts.height ?? 250, L = 56, R = 18, T = 16, B = 28;
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    if (opts.ref) all.push(opts.ref.y);
    if (all.length === 0) return "";
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo || hi || 1) * 0.12;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const innerW = W - L - R, innerH = H - T - B;
    const n = labels.length;
    const xs = (i: number) => L + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const ys = (v: number) => T + innerH - ((v - lo) / (hi - lo)) * innerH;
    const yFmt = opts.yFmt ?? ((v: number) => `$${v.toFixed(2)}`);
    let g = "", body = "";
    for (let i = 0; i <= 4; i++) {
        const y = T + innerH - (innerH * i) / 4;
        g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#ffffff" stroke-opacity="${i === 0 ? 0.18 : 0.06}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="#7d8590" font-size="10">${yFmt(lo + ((hi - lo) * i) / 4)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 8));
    labels.forEach((lb, i) => {
        if (i === n - 1 || (i % step === 0 && n - 1 - i >= Math.max(1, Math.ceil(step * 0.7)))) g += `<text x="${xs(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#7d8590" font-size="10">${esc(lb)}</text>`;
    });
    if (opts.ref) {
        const y = ys(opts.ref.y);
        g += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${opts.ref.color}" stroke-dasharray="2 4" stroke-width="1.4"/><text x="${L + 6}" y="${(y - 6).toFixed(1)}" fill="${opts.ref.color}" font-size="10.5" font-weight="600">${esc(opts.ref.label)}</text>`;
    }
    series.forEach((s) => {
        const pts = s.values.map((v, i) => (v === null ? null : `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`)).filter((p): p is string => p !== null);
        if (pts.length === 0) return;
        body += `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="5 5"' : ""}/>`;
        if (n <= 60) body += s.values.map((v, i) => (v === null ? "" : `<circle cx="${xs(i).toFixed(1)}" cy="${ys(v).toFixed(1)}" r="3" fill="#0b0d10" stroke="${s.color}" stroke-width="1.8"/>`)).join("");
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}${body}</svg>`;
}

/** Donut with a centre label. */
export function donut(parts: { label: string; value: number; color: string }[], center: { top: string; bottom: string }): string {
    const total = parts.reduce((t, p) => t + p.value, 0);
    const R = 62, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = parts
        .filter((p) => p.value > 0)
        .map((p) => {
            const len = (p.value / total) * C;
            const gap = parts.filter((x) => x.value > 0).length > 1 ? 3 : 0;
            const el = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - Math.max(0, len - gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" stroke-linecap="butt" transform="rotate(-90 90 90)"/>`;
            off += len;
            return el;
        })
        .join("");
    return `<svg viewBox="0 0 180 180" role="img" class="donut"><circle cx="90" cy="90" r="${R}" fill="none" stroke="#ffffff" stroke-opacity=".06" stroke-width="16"/>${arcs}<text x="90" y="88" text-anchor="middle" fill="#f0f3f6" font-size="26" font-weight="700">${esc(center.top)}</text><text x="90" y="108" text-anchor="middle" fill="#8b949e" font-size="10.5">${esc(center.bottom)}</text></svg>`;
}

/** Tiny trend line for a KPI tile. */
export function sparkline(values: number[], color: string): string {
    if (values.length < 2) return "";
    const W = 120, H = 34, P = 3;
    const lo = Math.min(...values), hi = Math.max(...values);
    const span = hi - lo || 1;
    const pts = values.map((v, i) => `${(P + ((W - 2 * P) * i) / (values.length - 1)).toFixed(1)},${(H - P - ((v - lo) / span) * (H - 2 * P)).toFixed(1)}`);
    const id = `sp${Math.abs(values.reduce((t, v, i) => t + v * (i + 1), 0) | 0)}${values.length}`;
    return `<svg viewBox="0 0 ${W} ${H}" class="spark"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="M${pts[0]}L${pts.join("L")}L${(W - P).toFixed(1)},${H}L${P},${H}Z" fill="url(#${id})"/><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
