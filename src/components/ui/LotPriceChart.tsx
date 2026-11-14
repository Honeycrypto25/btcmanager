"use client";

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExpandableCard } from "@/components/ui/ExpandableCard";

export interface LotChartPoint {
    t: number; // buy time, ms
    buyPrice: number;
    targetPrice: number | null;
    status: string; // "OPEN" | "FILLED" | others (ignored)
}

export interface LotChartLimitBuy {
    id: string;
    limitPriceUsd: number;
    amountUsd: number;
}

interface Props {
    lots: LotChartPoint[];
    currentPrice: number | null;
    fmt: (n: number) => string;
    fmtUsd?: (n: number) => string;
    /** Open limit BUY orders, drawn as amber dashed lines. */
    limitBuys?: LotChartLimitBuy[];
}

/**
 * "Buy price vs. sell target, per lot" — active orders only in the normal view;
 * in the full-screen view a toggle also adds the finished (filled) orders.
 */
export function LotPriceChart({ lots, currentPrice, fmt, fmtUsd, limitBuys = [] }: Props) {
    const [showDone, setShowDone] = useState(false);
    const money = fmtUsd ?? fmt;

    const rows = useMemo(
        () =>
            [...lots]
                .filter((l) => l.status === "OPEN" || l.status === "FILLED")
                .sort((a, b) => a.t - b.t)
                .map((l) => ({
                    t: l.t,
                    date: format(new Date(l.t), "d MMM"),
                    status: l.status,
                    buyPrice: l.buyPrice,
                    targetPrice: l.status === "OPEN" ? l.targetPrice : null,
                    donePrice: l.status === "FILLED" ? l.targetPrice : null,
                })),
        [lots]
    );
    const doneCount = rows.filter((r) => r.status === "FILLED").length;
    if (rows.filter((r) => r.status === "OPEN").length === 0 && limitBuys.length === 0 && doneCount === 0) return null;

    return (
        <ExpandableCard
            title="Preț de achiziție vs. țintă de vânzare, per lot (ordine active)"
            description={
                <>
                    {limitBuys.length > 0 && <span className="text-amber-400">Liniile galbene punctate = ordine limit de cumpărare active (nivelul la care se cumpără). </span>}
                    <span>În modul mărit poți adăuga și ordinele finalizate.</span>
                </>
            }
            headerExtra={(expanded) =>
                expanded ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted hover:text-foreground">
                        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-emerald-500" />
                        Arată și ordinele finalizate ({doneCount})
                    </label>
                ) : null
            }
        >
            {(expanded) => {
                const withDone = expanded && showDone;
                const data = withDone ? rows : rows.filter((r) => r.status === "OPEN");
                return (
                    <div className={expanded ? "min-h-[320px] flex-1" : "h-[280px]"}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" minTickGap={24} />
                                <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" domain={["auto", "auto"]} />
                                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} formatter={(v) => money(Number(v))} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                {currentPrice && (
                                    <ReferenceLine
                                        y={currentPrice}
                                        stroke="#e5e7eb"
                                        strokeDasharray="2 3"
                                        label={{ value: `Preț curent: ${money(currentPrice)}`, position: "insideTopRight", fill: "#e5e7eb", fontSize: 11 }}
                                    />
                                )}
                                {limitBuys.map((o) => (
                                    <ReferenceLine
                                        key={o.id}
                                        y={o.limitPriceUsd}
                                        stroke="#f59e0b"
                                        strokeDasharray="6 4"
                                        strokeWidth={1.5}
                                        ifOverflow="extendDomain"
                                        label={{ value: `Limit buy ${fmt(o.limitPriceUsd)} · ${money(o.amountUsd)}`, position: "insideBottomLeft", fill: "#f59e0b", fontSize: 11 }}
                                    />
                                ))}
                                <Line type="monotone" dataKey="buyPrice" name="Preț achiziție" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="targetPrice" name="Preț țintă (activ)" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} connectNulls />
                                {withDone && <Line type="monotone" dataKey="donePrice" name="Țintă atinsă (finalizat)" stroke="#9ca3af" strokeWidth={0} dot={{ r: 3.5, fill: "#9ca3af", stroke: "#9ca3af" }} activeDot={{ r: 5 }} />}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                );
            }}
        </ExpandableCard>
    );
}
