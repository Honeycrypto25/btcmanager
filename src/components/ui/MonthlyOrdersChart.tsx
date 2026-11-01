"use client";

import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { format } from "date-fns";
import { Card } from "@/components/ui/core";

export interface OrderLike {
    status: string;
    boughtAt: string;
    buyAmountUsd: string;
}

/**
 * "Ordine pe lună" for the single-token DCA bots (Solana, Eva, Base, BNB):
 * how many DCA cycles were opened each month (orange) and how many of those
 * have already sold at the take-profit target (green), over a fixed trailing
 * 14-month window, with dashed lines for the monthly averages. Cancelled and
 * failed cycles are left out. Helps decide when to raise or lower the amount
 * per order.
 */
export function MonthlyOrdersChart({ lots, symbol }: { lots: OrderLike[]; symbol: string }) {
    const data = useMemo(() => {
        const now = new Date();
        const months: { key: string; label: string }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
        }
        const rows = months.map(({ key, label }) => {
            let placed = 0;
            let sold = 0;
            let usd = 0;
            for (const lot of lots) {
                if (lot.status === "FAILED" || lot.status === "CANCELLED") continue;
                if (format(new Date(lot.boughtAt), "yyyy-MM") !== key) continue;
                placed += 1;
                usd += Number(lot.buyAmountUsd);
                if (lot.status === "FILLED") sold += 1;
            }
            return { month: label, placed, sold, usd };
        });
        const active = rows.filter((r) => r.placed > 0);
        const orders = active.reduce((t, r) => t + r.placed, 0);
        const soldTotal = active.reduce((t, r) => t + r.sold, 0);
        const usd = active.reduce((t, r) => t + r.usd, 0);
        return {
            rows,
            avgPlaced: active.length ? orders / active.length : 0,
            avgSold: active.length ? soldTotal / active.length : 0,
            avgOrderUsd: orders ? usd / orders : 0,
            hasData: orders > 0,
        };
    }, [lots]);

    if (!data.hasData) return null;

    return (
        <Card>
            <h2 className="mb-1 text-sm font-medium text-foreground">Ordine pe lună</h2>
            <p className="mb-4 text-xs text-faint">
                Câte cicluri {symbol} s-au deschis în fiecare lună (portocaliu) și câte s-au vândut deja la țintă (verde) — ultimele 14 luni, fără cele anulate sau eșuate, respectă filtrele curente. Liniile punctate sunt mediile pe lunile cu ordine. Medie {data.avgPlaced.toFixed(1)} ordine/lună · ${data.avgOrderUsd.toFixed(2)} per ordin.
            </p>
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                    <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine
                        y={Math.round(data.avgPlaced * 100) / 100}
                        stroke="#e8bc70"
                        strokeDasharray="4 4"
                        label={{ value: `Medie plasate ${data.avgPlaced.toFixed(1)}/lună`, position: "insideTopLeft", fill: "#e8bc70", fontSize: 11 }}
                    />
                    <ReferenceLine
                        y={Math.round(data.avgSold * 100) / 100}
                        stroke="#4ade80"
                        strokeDasharray="4 4"
                        label={{ value: `Medie vândute ${data.avgSold.toFixed(1)}/lună`, position: "insideBottomLeft", fill: "#4ade80", fontSize: 11 }}
                    />
                    <Bar dataKey="placed" name={`${symbol} ordine`} fill="#e8a33d" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sold" name={`${symbol} vândute`} fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </Card>
    );
}
