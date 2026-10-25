"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/components/ui/core";

/**
 * Status filter for the bots' lot/cycle tables (Solana, EVA, BNB, Base,
 * Polygon). Lives on the table itself -- it only changes which rows the
 * table shows, never the stats cards or charts above it.
 *
 * Defaults to the still-running statuses (active / in-progress orders),
 * since those are the ones worth watching. If a bot has no running lot at
 * all, it starts on "Toate" instead of an empty table.
 */
export function useLotStatusFilter<T extends { status: string }>(lots: T[], defaultStatuses: Iterable<string>) {
    const [selected, setSelected] = useState<Set<string>>(() => {
        const defaults = new Set(defaultStatuses);
        const anyPresent = lots.some((l) => defaults.has(l.status));
        return anyPresent ? defaults : new Set();
    });

    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const l of lots) map.set(l.status, (map.get(l.status) ?? 0) + 1);
        return map;
    }, [lots]);

    const filtered = useMemo(
        () => (selected.size === 0 ? lots : lots.filter((l) => selected.has(l.status))),
        [lots, selected]
    );

    return { filtered, selected, setSelected, counts, total: lots.length };
}

export function LotStatusFilter({
    labels,
    counts,
    total,
    selected,
    onChange,
}: {
    /** status -> label, in display order. */
    labels: Record<string, string>;
    counts: Map<string, number>;
    total: number;
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
}) {
    // Show every known status that has lots, plus any selected one (so a
    // default selection with 0 matches is still visible and clearable).
    const options = Object.entries(labels).filter(([value]) => (counts.get(value) ?? 0) > 0 || selected.has(value));

    function toggle(value: string) {
        const next = new Set(selected);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        onChange(next);
    }

    const chip = (active: boolean) =>
        cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap border",
            active ? "bg-primary text-black border-primary" : "text-muted border-border hover:text-foreground hover:bg-white/[0.04]"
        );

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onChange(new Set())} className={chip(selected.size === 0)}>
                Toate ({total})
            </button>
            {options.map(([value, label]) => (
                <button key={value} type="button" onClick={() => toggle(value)} className={chip(selected.has(value))}>
                    {label} ({counts.get(value) ?? 0})
                </button>
            ))}
        </div>
    );
}
