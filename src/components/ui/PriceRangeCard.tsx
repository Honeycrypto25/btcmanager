"use client";

import React from "react";
import { Card, cn } from "@/components/ui/core";

export interface PriceRangeLot {
    date: string;
    buyPrice: number;
    targetPrice: number | null;
}

interface Props {
    lots: PriceRangeLot[];
    currentPrice: number | null;
    fmt: (n: number) => string;
}

const pct = (n: number, signed = true) => `${signed && n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`;

function extremes(values: { v: number; date: string }[]) {
    if (values.length === 0) return null;
    let lo = values[0];
    let hi = values[0];
    for (const x of values) {
        if (x.v < lo.v) lo = x;
        if (x.v > hi.v) hi = x;
    }
    return { lo, hi };
}

function RangeBlock({
    title,
    color,
    lowLabel,
    highLabel,
    ext,
    currentPrice,
    fmt,
}: {
    title: string;
    color: string;
    lowLabel: string;
    highLabel: string;
    ext: { lo: { v: number; date: string }; hi: { v: number; date: string } };
    currentPrice: number | null;
    fmt: (n: number) => string;
}) {
    const { lo, hi } = ext;
    const diffAbs = hi.v - lo.v;
    const diffPct = lo.v > 0 ? (diffAbs / lo.v) * 100 : null;
    const span = hi.v - lo.v;
    const nowPos = currentPrice !== null && span > 0 ? Math.min(100, Math.max(0, ((currentPrice - lo.v) / span) * 100)) : null;
    const vsNow = (v: number) => (currentPrice ? ((v - currentPrice) / currentPrice) * 100 : null);

    const side = (label: string, x: { v: number; date: string }, tone: string, align: string) => {
        const d = vsNow(x.v);
        return (
            <div className={align}>
                <p className="text-xs text-faint">{label}</p>
                <p className={cn("font-display text-xl font-medium tabular-nums", tone)}>{fmt(x.v)}</p>
                <p className="text-xs text-faint tabular-nums">
                    lot {x.date}
                    {d !== null ? ` · ${pct(d)} față de curent` : ""}
                </p>
            </div>
        );
    };

    return (
        <div className="min-w-0 rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-medium" style={{ color }}>
                {title}
            </h3>
            <div className="relative mx-1.5 mb-3 mt-6 h-2 rounded-full bg-white/10">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-400/60 to-blue-400/60" />
                <span className="absolute -top-1 left-0 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[#151515] bg-amber-400" />
                <span className="absolute -top-1 right-0 h-4 w-4 translate-x-1/2 rounded-full border-2 border-[#151515] bg-blue-400" />
                {nowPos !== null && (
                    <span
                        title="Preț curent"
                        className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[#151515] bg-white"
                        style={{ left: `${nowPos}%` }}
                    />
                )}
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
                {side(lowLabel, lo, "text-amber-300", "text-left")}
                {side(highLabel, hi, "text-blue-300", "text-right")}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                <span className="text-xs text-faint">Diferență mic → mare</span>
                <span className="font-display text-lg font-medium tabular-nums text-emerald-300">
                    {diffPct !== null ? pct(diffPct) : "—"} · {fmt(diffAbs)}
                </span>
            </div>
        </div>
    );
}

/** Lowest/highest buy price and sell target across the active (OPEN) lots, with the gap between them. */
export function PriceRangeCard({ lots, currentPrice, fmt }: Props) {
    const buy = extremes(lots.map((l) => ({ v: l.buyPrice, date: l.date })));
    const target = extremes(lots.filter((l) => l.targetPrice !== null).map((l) => ({ v: l.targetPrice as number, date: l.date })));
    if (!buy) return null;

    return (
        <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-foreground">Interval prețuri · ordine active</h2>
                <span className="text-xs text-faint">
                    {lots.length} loturi{currentPrice ? ` · preț curent ${fmt(currentPrice)}` : ""}
                </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <RangeBlock
                    title="Preț de achiziție"
                    color="#8b5cf6"
                    lowLabel="Cel mai mic"
                    highLabel="Cel mai mare"
                    ext={buy}
                    currentPrice={currentPrice}
                    fmt={fmt}
                />
                {target && (
                    <RangeBlock
                        title="Preț țintă de vânzare"
                        color="#22c55e"
                        lowLabel="Cea mai mică"
                        highLabel="Cea mai mare"
                        ext={target}
                        currentPrice={currentPrice}
                        fmt={fmt}
                    />
                )}
            </div>
        </Card>
    );
}
