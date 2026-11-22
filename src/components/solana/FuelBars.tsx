"use client";

import React from "react";
import { Bar, BarChart, Cell, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface FuelPoint {
    label: string;
    usdc: number;
}

const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdShort = (v: number) => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * USDC left in the bot wallet now and after each scheduled buy. "Acum" is green, the next buys are blue, and a bar
 * that is already below one buy (the next one can't be funded) turns amber. A dashed line marks the size of one buy.
 */
export function FuelBars({
    data, buyAmountUsd, height = 240, fmt = usd, fmtShort = usdShort, unit = "USDC", action = "cumpărarea", actionNoun = "cumpărare", afterLabel = "după cumpărare",
}: {
    data: FuelPoint[]; buyAmountUsd: number; height?: number;
    fmt?: (v: number) => string; fmtShort?: (v: number) => string; unit?: string; action?: string; actionNoun?: string; afterLabel?: string;
}) {
    const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
    return (
        <div>
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 22, right: 10, left: 0, bottom: 0 }} barCategoryGap="26%">
                <defs>
                    <linearGradient id={`${uid}now`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6ee7b7" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id={`${uid}buy`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7cc4ff" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id={`${uid}low`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f6d98f" />
                        <stop offset="100%" stopColor="#d49a3a" stopOpacity={0.75} />
                    </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} width={44} tickFormatter={fmtShort} />
                {buyAmountUsd > 0 && (
                    <ReferenceLine y={buyAmountUsd} stroke="rgba(232,188,112,0.55)" strokeDasharray="5 4" />
                )}
                <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={({ active, payload }) => {
                        const p = active ? (payload?.[0]?.payload as FuelPoint | undefined) : undefined;
                        if (!p) return null;
                        const isNow = p.label === "Acum";
                        return (
                            <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs shadow-xl">
                                <p className="mb-1 text-foreground">{isNow ? "Acum" : `După ${action} din ${p.label}`}</p>
                                <p className="font-mono text-sm text-foreground">{fmt(p.usdc)} {unit}</p>
                                {!isNow && buyAmountUsd > 0 && <p className="text-muted">{actionNoun}: −{fmt(buyAmountUsd)}</p>}
                                {p.usdc < buyAmountUsd && <p className="mt-1 text-amber-300">nu mai ajunge pentru o {actionNoun}</p>}
                            </div>
                        );
                    }}
                />
                <Bar dataKey="usdc" name={`${unit} rămas`} radius={[6, 6, 0, 0]} maxBarSize={84}>
                    {data.map((p, i) => (
                        <Cell key={i} fill={`url(#${uid}${p.label === "Acum" ? "now" : p.usdc < buyAmountUsd ? "low" : "buy"})`} />
                    ))}
                    <LabelList dataKey="usdc" position="top" formatter={(v) => fmt(Number(v))} style={{ fill: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "ui-monospace, monospace" }} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#10b981]" />acum</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3b82f6]" />{afterLabel}</span>
            {buyAmountUsd > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-[#e8bc70]" />o {actionNoun} ({fmtShort(buyAmountUsd)})</span>}
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d49a3a]" />nu mai ajunge</span>
        </div>
        </div>
    );
}
