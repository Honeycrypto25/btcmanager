"use client";

import { Card, cn } from "@/components/ui/core";

export interface CompareRow {
    label: string;
    cur: number;
    prev: number;
    fmt: (n: number) => string;
}

/** Sum (or count, with v = 1) of events inside the last 30 days vs. the 30 days before those. */
export function split30(items: { t: number | null; v: number }[], now: number): { cur: number; prev: number } {
    const DAY = 86_400_000;
    const since = now - 30 * DAY;
    const since60 = now - 60 * DAY;
    let cur = 0;
    let prev = 0;
    for (const i of items) {
        if (i.t == null) continue;
        if (i.t >= since) cur += i.v;
        else if (i.t >= since60) prev += i.v;
    }
    return { cur, prev };
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
    const d = prev > 0 ? ((cur - prev) / prev) * 100 : null;
    if (d === null) return <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-muted">{cur > 0 ? "nou" : "—"}</span>;
    const up = d > 0.05;
    const down = d < -0.05;
    return (
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", up ? "border-emerald-400/40 text-emerald-300" : down ? "border-red-400/40 text-red-300" : "border-white/15 text-muted")}>
            {d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(1)}%
        </span>
    );
}

/** "Ultimele 30 de zile vs. cele anterioare" — same comparison the public share page shows. */
export function Compare30Card({ rows, note }: { rows: CompareRow[]; note?: string }) {
    return (
        <div>
            <div className="mb-3 flex items-center gap-3">
                <span className="h-px w-6 bg-emerald-400/70" />
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Ultimele 30 de zile vs. cele anterioare</h2>
            </div>
            <Card className="p-5">
                {note && <p className="mb-4 text-xs text-muted">{note}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                    {rows.map((r) => {
                        const mx = Math.max(r.cur, r.prev, 0.0001);
                        const bar = (v: number, cls: string) => <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07]"><div className={cn("h-full rounded-full", cls)} style={{ width: `${Math.round((v / mx) * 100)}%` }} /></div>;
                        return (
                            <div key={r.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{r.label}</span>
                                    <Delta cur={r.cur} prev={r.prev} />
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="w-28 shrink-0 text-muted">Ultimele 30 z</span>
                                    {bar(r.cur, "bg-gradient-to-r from-[#e8bc70] to-[#52c98a]")}
                                    <b className="w-24 shrink-0 text-right text-foreground">{r.fmt(r.cur)}</b>
                                </div>
                                <div className="mt-2 flex items-center gap-3 text-sm">
                                    <span className="w-28 shrink-0 text-muted">30 z anterioare</span>
                                    {bar(r.prev, "bg-gradient-to-r from-slate-500 to-slate-400")}
                                    <b className="w-24 shrink-0 text-right text-foreground">{r.fmt(r.prev)}</b>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}
