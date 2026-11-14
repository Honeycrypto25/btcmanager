"use client";

import React, { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export interface SortState {
    key: string;
    dir: SortDir;
}

type Accessor<T> = (row: T) => number | string | null | undefined;

/** Client-side column sorting. Empty values (—) always sink to the bottom, whichever direction is active. */
export function useSort<T>(rows: T[], accessors: Record<string, Accessor<T>>, initial: SortState, ascFirst: string[] = ["status"]) {
    const [sort, setSort] = useState<SortState>(initial);

    const sorted = useMemo(() => {
        const get = accessors[sort.key];
        if (!get) return rows;
        const mul = sort.dir === "asc" ? 1 : -1;
        return [...rows].sort((a, b) => {
            const va = get(a);
            const vb = get(b);
            const na = va === null || va === undefined || (typeof va === "number" && Number.isNaN(va));
            const nb = vb === null || vb === undefined || (typeof vb === "number" && Number.isNaN(vb));
            if (na && nb) return 0;
            if (na) return 1;
            if (nb) return -1;
            if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb), "ro") * mul;
            return ((va as number) - (vb as number)) * mul;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sort]);

    const toggle = (key: string) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: ascFirst.includes(key) ? "asc" : "desc" }));

    return { sorted, sort, toggle };
}

/** Table header cell that sorts its column on click. */
export function SortTh({ label, k, sort, onSort, className }: { label: string; k: string; sort: SortState; onSort: (k: string) => void; className?: string }) {
    const active = sort.key === k;
    return (
        <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
            <button type="button" onClick={() => onSort(k)} className={`group inline-flex cursor-pointer select-none items-center gap-1 whitespace-nowrap uppercase tracking-[inherit] transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}>
                {label}
                <span className={`text-[9px] leading-none ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>{active && sort.dir === "asc" ? "▲" : "▼"}</span>
            </button>
        </th>
    );
}
