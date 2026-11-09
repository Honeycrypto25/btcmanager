"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, cn } from "@/components/ui/core";

export interface BotFuelData {
    /** USDC in the bot wallet (buy "fuel"). */
    usdcBalance: number;
    buyAmountUsd: number;
    intervalHours: number;
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

/** Half-circle dial split between the two buckets (wallet vs pending), total in the middle. */
function Dial({ wallet, pending }: { wallet: number; pending: number }) {
    const total = wallet + pending;
    const r = 80;
    const c = Math.PI * r; // half-circumference
    const wl = total > 0 ? (wallet / total) * c : 0;
    const pl = total > 0 ? (pending / total) * c : 0;
    const path = `M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`;
    return (
        <div className="relative mx-auto w-full max-w-[320px]">
            <svg viewBox="0 0 200 112" className="w-full" role="img" aria-label="Portofel și pending">
                <path d={path} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={20} strokeLinecap="round" />
                {wl > 0 && <path d={path} fill="none" stroke={BLUE} strokeWidth={20} strokeDasharray={`${wl} ${c}`} strokeLinecap="butt" />}
                {pl > 0 && <path d={path} fill="none" stroke={AMBER} strokeWidth={20} strokeDasharray={`${pl} ${c}`} strokeDashoffset={-wl} strokeLinecap="butt" />}
            </svg>
            <div className="absolute inset-x-0 bottom-1 text-center">
                <p className="text-[11px] uppercase tracking-wider text-faint">Total bot</p>
                <p className="font-mono text-lg font-medium text-foreground">{usd(total)}</p>
            </div>
        </div>
    );
}

/** Bot "fuel" for the loan: how much is waiting in sell orders, how much USDC is left to buy with. */
export function LendBotFuel({ bot }: { bot: BotOverview }) {
    const { fuel, pending } = bot;
    const wallet = fuel?.usdcBalance ?? 0;
    const pendUsd = pending?.usd ?? 0;

    const cyclesLeft = fuel && fuel.buyAmountUsd > 0 ? Math.floor(fuel.usdcBalance / fuel.buyAmountUsd) : 0;
    const daysLeft = fuel ? cyclesLeft * (fuel.intervalHours / 24) : 0;
    // What the bot will spend over the next 30 days at the current rhythm.
    const monthNeed = fuel && fuel.intervalHours > 0 ? fuel.buyAmountUsd * ((30 * 24) / fuel.intervalHours) : 0;
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
                    <div className="flex justify-center gap-6 text-xs">
                        <span className="flex items-center gap-1.5 text-muted">
                            <span className="h-2 w-2 rounded-sm" style={{ background: BLUE }} />
                            Portofel (USDC) <span className="font-mono text-foreground">{usd(wallet)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-muted">
                            <span className="h-2 w-2 rounded-sm" style={{ background: AMBER }} />
                            În pending <span className="font-mono text-foreground">{usd(pendUsd)}</span>
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Tile label="Ordine în pending" value={pending ? String(pending.count) : "—"} note={pending ? `${pending.sol.toFixed(4)} SOL blocat în ordine` : undefined} />
                    <Tile label="Combustibil rămas" value={fuel ? `${Math.floor(daysLeft)} zile` : "—"} note={fuel ? `${cyclesLeft} cumpărări de ${usd(fuel.buyAmountUsd)}, la ${fuel.intervalHours}h` : undefined} />
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
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={fuel.projected}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" width={48} />
                            <Tooltip
                                contentStyle={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => [usd(Number(v)), "USDC proiectat"]}
                            />
                            <Bar dataKey="usdc" name="USDC proiectat" fill="rgba(96,165,250,0.7)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
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
