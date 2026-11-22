"use client";

import React from "react";
import { Card, cn } from "@/components/ui/core";
import { FuelBars } from "@/components/solana/FuelBars";

export interface BotFuelData {
    /** USDC in the bot wallet (buy "fuel"). */
    usdcBalance: number;
    buyAmountUsd: number;
    intervalHours: number;
    /** Hours between real buys (whole days, from the daily 09:00 UTC cron). */
    periodHours: number;
    /** Whole days the balance lasts, and how many buys it funds. */
    daysRemaining: number;
    buysLeft: number;
    projected: { label: string; usdc: number }[];
}
export interface BotPendingData {
    count: number;
    /** SOL still locked in pending sell orders. */
    sol: number;
    /** Market value of that SOL right now. */
    usd: number;
}
export interface BotOverview {
    /** Realized profit of bot lots sold in the last 30 days. */
    realized30d: { usd: number; count: number } | null;
    /** Every sold (FILLED) lot: sale time in ms and its realized profit, for the month-by-month history. */
    profits: { t: number; usd: number }[];
    fuel: BotFuelData | null;
    fuelError: string | null;
    pending: BotPendingData | null;
    solPriceUsd: number | null;
}

const BLUE = "#60a5fa";
const AMBER = "#e8bc70";
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Half-circle dial split between the two buckets (wallet vs pending), total in the middle: rounded gradient arcs
 * with a soft glow, a fine tick scale and a short entrance sweep. Numbers are the same, only the look is richer.
 */
function Dial({ wallet, pending }: { wallet: number; pending: number }) {
    const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
    const [ready, setReady] = React.useState(false);
    React.useEffect(() => {
        const t = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(t);
    }, []);

    const total = wallet + pending;
    const cx = 120;
    const cy = 122;
    const r = 90;
    const sw = 15;
    const c = Math.PI * r; // half-circumference
    const both = wallet > 0 && pending > 0;
    const gap = both ? 5 : 0;
    const wl = total > 0 ? (wallet / total) * c : 0;
    const pl = total > 0 ? (pending / total) * c : 0;
    const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    const d1 = Math.max(0.01, wl - gap / 2 - sw);
    const d2 = Math.max(0.01, pl - gap / 2 - sw);
    const s2 = wl + gap / 2 + sw / 2;
    const pendPct = total > 0 ? Math.round((pending / total) * 100) : 0;

    // Fine scale just inside the arc (21 ticks, every 5th longer).
    const ticks = Array.from({ length: 21 }, (_, i) => {
        const a = Math.PI - (i / 20) * Math.PI;
        const long = i % 5 === 0;
        const r1 = r - sw / 2 - 7;
        const r2 = r1 - (long ? 7 : 3.5);
        return { x1: (cx + r1 * Math.cos(a)).toFixed(2), y1: (cy - r1 * Math.sin(a)).toFixed(2), x2: (cx + r2 * Math.cos(a)).toFixed(2), y2: (cy - r2 * Math.sin(a)).toFixed(2), long };
    });

    return (
        <div className="relative mx-auto w-full max-w-[340px]">
            <svg viewBox="0 0 240 150" className="w-full overflow-visible" role="img" aria-label="Portofel și pending">
                <defs>
                    <linearGradient id={`${uid}b`} x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#7cc4ff" />
                    </linearGradient>
                    <linearGradient id={`${uid}a`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#f6d98f" />
                        <stop offset="100%" stopColor="#d49a3a" />
                    </linearGradient>
                    <filter id={`${uid}g`} x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="5" />
                    </filter>
                </defs>

                {/* soft glow under the filled arcs */}
                <g filter={`url(#${uid}g)`} opacity={0.35}>
                    {wl > 0 && <path d={path} fill="none" stroke="#3b82f6" strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${ready ? d1 : 0.01} ${c * 2}`} strokeDashoffset={-sw / 2} style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }} />}
                    {pl > 0 && <path d={path} fill="none" stroke="#d49a3a" strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${ready ? d2 : 0.01} ${c * 2}`} strokeDashoffset={-s2} style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }} />}
                </g>

                {/* track */}
                <path d={path} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} strokeLinecap="round" />

                {/* scale */}
                {ticks.map((t, i) => (
                    <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.14)" strokeWidth={t.long ? 1.2 : 0.8} strokeLinecap="round" />
                ))}

                {/* wallet (blue) then pending (gold) */}
                {wl > 0 && <path d={path} fill="none" stroke={`url(#${uid}b)`} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${ready ? d1 : 0.01} ${c * 2}`} strokeDashoffset={-sw / 2} style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }} />}
                {pl > 0 && <path d={path} fill="none" stroke={`url(#${uid}a)`} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${ready ? d2 : 0.01} ${c * 2}`} strokeDashoffset={-s2} style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }} />}
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">Total bot</p>
                <p className="font-mono text-[28px] font-medium leading-tight tracking-tight text-foreground">{usd(total)}</p>
                <p className="mt-0.5 text-[11px] text-muted">{total > 0 ? `${pendPct}% în ordine pending` : "fără fonduri"}</p>
            </div>
        </div>
    );
}

/** Bot "fuel" for the loan: how much is waiting in sell orders, how much USDC is left to buy with. */
export function LendBotFuel({ bot }: { bot: BotOverview }) {
    const { fuel, pending } = bot;
    const wallet = fuel?.usdcBalance ?? 0;
    const pendUsd = pending?.usd ?? 0;

    const cyclesLeft = fuel?.buysLeft ?? 0;
    const daysLeft = fuel?.daysRemaining ?? 0;
    // What the bot will spend over the next 30 days at the current rhythm.
    const monthNeed = fuel && fuel.periodHours > 0 ? fuel.buyAmountUsd * ((30 * 24) / fuel.periodHours) : 0;
    const diff = wallet - monthNeed;
    const enough = diff >= 0;

    return (
        <Card className="space-y-4">
            <div>
                <h2 className="font-display text-base font-medium text-foreground">Combustibil bot</h2>
                <p className="text-xs text-muted">
                    Ce așteaptă în ordine de vânzare (pending) și cât USDC mai are botul de cumpărat — ca să vezi la început de lună dacă poți returna din împrumut sau mai trebuie să împrumuți.
                </p>
            </div>

            {bot.fuelError && <p className="text-xs text-amber-300">Portofelul botului: {bot.fuelError}</p>}

            <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                    <Dial wallet={wallet} pending={pendUsd} />
                    <div className="flex flex-wrap justify-center gap-2 text-xs">
                        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-muted">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "linear-gradient(135deg,#3b82f6,#7cc4ff)", boxShadow: "0 0 8px rgba(96,165,250,0.6)" }} />
                            Portofel (USDC) <span className="font-mono text-foreground">{usd(wallet)}</span>
                        </span>
                        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-muted">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "linear-gradient(135deg,#f6d98f,#d49a3a)", boxShadow: "0 0 8px rgba(232,188,112,0.55)" }} />
                            În pending <span className="font-mono text-foreground">{usd(pendUsd)}</span>
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Tile label="Ordine în pending" value={pending ? String(pending.count) : "—"} note={pending ? `${pending.sol.toFixed(4)} SOL blocat în ordine` : undefined} />
                    <Tile label="Combustibil rămas" value={fuel ? `${Math.floor(daysLeft)} zile` : "—"} note={fuel ? `${cyclesLeft} cumpărări de ${usd(fuel.buyAmountUsd)}, la ${fuel.periodHours / 24 === 1 ? "fiecare zi" : `${fuel.periodHours / 24} zile`}` : undefined} />
                    <Tile label="Necesar 30 de zile" value={fuel ? usd(monthNeed) : "—"} note="la ritmul curent de cumpărare" />
                    <Tile
                        label={enough ? "Surplus față de lună" : "Lipsesc pentru lună"}
                        value={fuel ? usd(Math.abs(diff)) : "—"}
                        note={fuel ? (enough ? "poți returna cel mult atât din împrumut" : "ar trebui împrumutat în plus") : undefined}
                        tone={fuel ? (enough ? "good" : "bad") : undefined}
                    />
                </div>
            </div>

            {fuel && fuel.projected.length > 1 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-faint">USDC rămas după fiecare cumpărare</p>
                    <FuelBars data={fuel.projected} buyAmountUsd={fuel.buyAmountUsd} height={250} />
                </div>
            )}
        </Card>
    );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
    return (
        <div className="space-y-0.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>
            <p className={cn("font-mono text-lg font-medium", tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-foreground")}>{value}</p>
            {note && <p className="text-[11px] text-muted">{note}</p>}
        </div>
    );
}
