"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/core";

export interface HeatLot {
    t: number; // buy time, ms
    buyPrice: number;
    targetPrice: number;
    profitUsd: number; // profit taken when the sell order fills (planned slice × (target − buy))
}

interface Props {
    lots: HeatLot[];
    currentPrice: number | null;
    fmt: (n: number) => string; // price formatter
    fmtUsd: (n: number) => string; // dollar amounts
}

const BINS = 44;
const RAMP: [number, [number, number, number]][] = [
    [0, [26, 36, 110]],
    [0.25, [58, 64, 195]],
    [0.5, [132, 72, 212]],
    [0.75, [232, 92, 152]],
    [0.9, [255, 162, 82]],
    [1, [255, 232, 130]],
];
function ramp(v: number): string {
    for (let i = 1; i < RAMP.length; i++) {
        if (v <= RAMP[i][0]) {
            const [a, ca] = RAMP[i - 1];
            const [b, cb] = RAMP[i];
            const f = (v - a) / (b - a);
            return ca.map((x, j) => Math.round(x + (cb[j] - x) * f)).join(",");
        }
    }
    return "255,232,130";
}

const MONTHS = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Liquidity-heatmap look-alike for profits: where the open sell targets sit, hotter where more profit is waiting. */
export function ProfitHeatmap({ lots, currentPrice, fmt, fmtUsd }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hover, setHover] = useState<number | null>(null);
    const [now] = useState(() => Date.now());

    const model = useMemo(() => {
        if (lots.length === 0) return null;
        const prices = [...lots.flatMap((l) => [l.buyPrice, l.targetPrice]), ...(currentPrice ? [currentPrice] : [])];
        let pmin = Math.min(...prices);
        let pmax = Math.max(...prices);
        const pad = (pmax - pmin) * 0.04 || pmax * 0.02;
        pmin -= pad;
        pmax += pad;
        const bin = (pmax - pmin) / BINS;
        const t0 = Math.min(...lots.map((l) => l.t));
        const t1 = Math.max(now, ...lots.map((l) => l.t)) + (now - t0) * 0.02;
        const cols = 90;
        const grid = Array.from({ length: cols }, () => new Float64Array(BINS));
        const profile = new Float64Array(BINS);
        const count = new Int32Array(BINS);
        let max = 0;
        for (const l of lots) {
            const b = Math.min(BINS - 1, Math.max(0, Math.floor((l.targetPrice - pmin) / bin)));
            profile[b] += l.profitUsd;
            count[b] += 1;
            for (let k = 0; k < cols; k++) {
                const tt = t0 + ((k + 0.5) / cols) * (t1 - t0);
                if (tt >= l.t) grid[k][b] += l.profitUsd;
            }
        }
        for (const g of grid) for (const v of g) max = Math.max(max, v);
        const pmaxProfile = Math.max(...profile);
        let best = 0;
        profile.forEach((v, i) => {
            if (v > profile[best]) best = i;
        });
        return { pmin, pmax, bin, t0, t1, cols, grid, profile, count, max, pmaxProfile, best };
    }, [lots, currentPrice, now]);

    const draw = useCallback(() => {
        const cv = canvasRef.current;
        if (!cv || !model) return;
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth;
        const H = cv.clientHeight;
        cv.width = W * dpr;
        cv.height = H * dpr;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const { pmin, pmax, bin, t0, t1, cols, grid, profile, max, pmaxProfile } = model;
        const pl = 6;
        const prof = Math.min(110, W * 0.14);
        const pr = 64;
        const pt = 6;
        const pb = 24;
        const cw = W - pl - pr - prof;
        const ch = H - pt - pb;
        const X = (t: number) => pl + ((t - t0) / (t1 - t0)) * cw;
        const Y = (p: number) => pt + (1 - (p - pmin) / (pmax - pmin)) * ch;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#0b0d12";
        ctx.fillRect(0, 0, W, H);

        const cwid = cw / cols + 1.2;
        const rh = ch / BINS + 1;
        for (let k = 0; k < cols; k++) {
            for (let b = 0; b < BINS; b++) {
                const v = grid[k][b];
                if (!v) continue;
                const f = Math.min(1, v / max);
                ctx.fillStyle = `rgba(${ramp(Math.pow(f, 0.7))},${0.35 + 0.65 * f})`;
                ctx.fillRect(pl + (k / cols) * cw, Y(pmin + (b + 1) * bin), cwid, rh);
            }
        }
        if (hover !== null) {
            ctx.fillStyle = "rgba(255,255,255,0.08)";
            ctx.fillRect(pl, Y(pmin + (hover + 1) * bin), cw + prof, ch / BINS);
        }

        // price axis
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        for (let i = 0; i <= 4; i++) {
            const p = pmin + ((pmax - pmin) * i) / 4;
            ctx.beginPath();
            ctx.moveTo(pl, Y(p));
            ctx.lineTo(pl + cw + prof, Y(p));
            ctx.stroke();
            ctx.fillText(fmt(p), pl + cw + prof + 6, Y(p) + 4);
        }
        // time axis
        for (let i = 0; i <= 3; i++) {
            const t = t0 + ((t1 - t0) * i) / 3;
            const d = new Date(t);
            ctx.fillText(`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, Math.max(pl, Math.min(X(t) - 12, pl + cw - 30)), H - 7);
        }
        // buy price dots
        ctx.fillStyle = "#d8c6ff";
        for (const l of lots) {
            ctx.beginPath();
            ctx.arc(X(l.t), Y(l.buyPrice), 2.4, 0, Math.PI * 2);
            ctx.fill();
        }
        // current price
        if (currentPrice) {
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = "rgba(255,255,255,0.85)";
            ctx.beginPath();
            ctx.moveTo(pl, Y(currentPrice));
            ctx.lineTo(pl + cw + prof, Y(currentPrice));
            ctx.stroke();
            ctx.setLineDash([]);
            const lab = fmt(currentPrice);
            const w = ctx.measureText(lab).width + 10;
            ctx.fillStyle = "#fff";
            ctx.fillRect(pl + cw + prof + 2, Y(currentPrice) - 9, w, 18);
            ctx.fillStyle = "#0b0d12";
            ctx.fillText(lab, pl + cw + prof + 7, Y(currentPrice) + 4);
        }
        // profile
        const px = pl + cw + 8;
        for (let b = 0; b < BINS; b++) {
            const v = profile[b];
            if (!v) continue;
            ctx.fillStyle = `rgba(${ramp(v / pmaxProfile)},0.9)`;
            ctx.fillRect(px, Y(pmin + (b + 1) * bin), (v / pmaxProfile) * (prof - 14), ch / BINS + 1);
        }
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText("PROFIL", px, pt + 10);
    }, [model, lots, currentPrice, fmt, hover]);

    useEffect(() => {
        draw();
        const cv = canvasRef.current;
        if (!cv) return;
        const ro = new ResizeObserver(draw);
        ro.observe(cv);
        return () => ro.disconnect();
    }, [draw]);

    if (!model) return null;
    const { pmin, bin, profile, count, best, pmaxProfile } = model;
    const total = lots.reduce((s, l) => s + l.profitUsd, 0);
    const above = currentPrice ? lots.map((l) => l.targetPrice).filter((t) => t > currentPrice).sort((a, b) => a - b)[0] : undefined;
    const bandText = (b: number) => `${fmt(pmin + b * bin)} – ${fmt(pmin + (b + 1) * bin)}`;
    const shown = hover !== null && profile[hover] > 0 ? hover : null;

    const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        const ch = r.height - 6 - 24;
        const y = e.clientY - r.top - 6;
        const b = BINS - 1 - Math.floor((y / ch) * BINS);
        setHover(b >= 0 && b < BINS ? b : null);
    };

    return (
        <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-medium text-foreground">Heatmap profituri · unde se vând ordinele active</h2>
                    <p className="text-xs text-muted">
                        Fiecare lot desenează o bandă la prețul lui țintă, de la data cumpărării până azi. Mai gros și mai fierbinte unde se adună mai mult profit. Bara din dreapta = profit pe nivel.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg,#1a246e,#583fd6,#d6479c,#ff9a4d,#ffe27a)" }} />
                    <span>0 → {fmtUsd(model.max)}</span>
                </div>
            </div>
            <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block h-[360px] w-full rounded-lg" />
            <p className="mt-2 min-h-[1.25rem] text-xs text-muted">
                {shown !== null
                    ? `${bandText(shown)} · ${count[shown]} ${count[shown] === 1 ? "ordin" : "ordine"} · profit ${fmtUsd(profile[shown])} (${((profile[shown] / total) * 100).toFixed(0)}% din total)`
                    : "Treci cu mouse-ul peste grafic ca să vezi nivelul."}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Cea mai groasă zonă</p>
                    <p className="font-mono text-base text-foreground">{bandText(best)}</p>
                    <p className="text-[11px] text-muted">
                        {fmtUsd(pmaxProfile)} · {count[best]} ordine
                    </p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Profit total la ținte</p>
                    <p className="font-mono text-base text-emerald-300">{fmtUsd(total)}</p>
                    <p className="text-[11px] text-muted">{lots.length} ordine active</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Prima țintă peste prețul curent</p>
                    <p className="font-mono text-base text-foreground">{above !== undefined && currentPrice ? fmt(above) : "—"}</p>
                    <p className="text-[11px] text-muted">{above !== undefined && currentPrice ? `+${(((above - currentPrice) / currentPrice) * 100).toFixed(1)}% față de curent` : "nicio țintă peste preț"}</p>
                </div>
            </div>
        </Card>
    );
}
