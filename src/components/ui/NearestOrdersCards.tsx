"use client";

import React from "react";
import { cn } from "@/components/ui/core";

export interface NearOrder {
    key: string;
    size: string; // e.g. "0.42 SOL"
    ageLabel: string;
    fromLabel: string; // "Cumpărat la"
    from: number;
    target: number;
    current: number | null;
    lastLabel: string; // "Profit la țintă"
    lastValue: string;
}

/**
 * The few open orders closest to executing, as cards: entry price → target, progress bar, and how far the current
 * price still is from the target. Same look as the open-order cards on the public share page.
 */
export function NearestOrdersCards({ title, orders, fmt }: { title: string; orders: NearOrder[]; fmt: (n: number) => string }) {
    if (orders.length === 0) return null;
    return (
        <div>
            <div className="mb-3 flex items-center gap-3">
                <span className="h-px w-6 bg-emerald-400/70" />
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{title}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
                {orders.map((o) => {
                    const span = o.target - o.from;
                    const progress = o.current != null && span !== 0 ? Math.max(0, Math.min(1, (o.current - o.from) / span)) : 0;
                    const left = o.current != null && o.current > 0 ? (o.target / o.current - 1) * 100 : null;
                    return (
                        <div key={o.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-baseline justify-between">
                                <span className="text-lg font-semibold text-foreground">{o.size}</span>
                                <span className="text-xs text-muted">{o.ageLabel}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div><p className="uppercase tracking-wider text-faint">{o.fromLabel}</p><p className="mt-1 text-base font-semibold text-foreground">{fmt(o.from)}</p></div>
                                <div><p className="uppercase tracking-wider text-faint">Țintă</p><p className="mt-1 text-base font-semibold text-emerald-400">{fmt(o.target)}</p></div>
                                <div><p className="uppercase tracking-wider text-faint">{o.lastLabel}</p><p className="mt-1 text-base font-semibold text-foreground">{o.lastValue}</p></div>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                                <div className="h-full rounded-full" style={{ width: `${Math.max(progress * 100, progress > 0 ? 3 : 0)}%`, background: "linear-gradient(90deg,#e8bc70,#52c98a)" }} />
                            </div>
                            <div className="mt-2 flex justify-between text-xs text-muted">
                                <span>{Math.round(progress * 100)}% din drum</span>
                                <span className={cn(left != null && left <= 0 && "text-emerald-400")}>
                                    {left == null ? "" : left > 0 ? `încă +${left.toFixed(1)}% până la țintă` : "ținta e atinsă"}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
