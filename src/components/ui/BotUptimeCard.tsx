"use client";

import React from "react";
import { Card } from "@/components/ui/core";

export interface UptimeDayDTO {
    date: string;
    status: "ok" | "warn" | "error" | "missed" | "pending" | "nodata";
    source: "log" | "lots" | "none";
    note?: string;
}
export interface BotUptimeDTO {
    bot: string;
    label: string;
    enabled: boolean;
    trackedSince: string | null;
    days: UptimeDayDTO[];
    pct7: number | null;
    pct30: number | null;
    counted7: number;
    counted30: number;
    est7?: boolean;
    est30?: boolean;
}

const COLOR: Record<UptimeDayDTO["status"], string> = {
    ok: "bg-emerald-500",
    warn: "bg-amber-400",
    error: "bg-red-500",
    missed: "bg-red-500/45",
    pending: "bg-white/25",
    nodata: "bg-white/[0.07]",
};
const LABEL: Record<UptimeDayDTO["status"], string> = {
    ok: "a funcționat",
    warn: "a rulat, dar nu a putut acționa",
    error: "eroare",
    missed: "nu a rulat",
    pending: "în așteptare",
    nodata: "fără date",
};

export function pctColor(p: number | null) {
    if (p === null) return "text-muted";
    return p >= 99 ? "text-emerald-300" : p >= 90 ? "text-amber-300" : "text-red-400";
}
export const fmtPct = (p: number | null, est = false) => (p === null ? "—" : `${est ? "~" : ""}${p >= 99.95 ? 100 : p.toFixed(1)}%`);

export function Strip({ days, tall }: { days: UptimeDayDTO[]; tall?: boolean }) {
    return (
        <div className="flex gap-[3px]">
            {days.map((d) => (
                <div
                    key={d.date}
                    title={`${d.date} · ${LABEL[d.status]}${d.source === "lots" ? " (estimat din loturi)" : ""}${d.note ? `\n${d.note}` : ""}`}
                    className={`${tall ? "h-11" : "h-9"} flex-1 rounded-[3px] ${COLOR[d.status]} ${d.source === "lots" ? "opacity-60" : ""}`}
                />
            ))}
        </div>
    );
}

/** Status-page style activity strip: last 7 and 30 days, % of days the bot actually worked. */
export function BotUptimeCard({ uptime }: { uptime: BotUptimeDTO }) {
    const last7 = uptime.days.slice(-7);
    const issues = uptime.days.filter((d) => d.status === "error" || d.status === "missed" || d.status === "warn").length;
    return (
        <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-medium text-foreground">Activitatea botului · {uptime.label}</h2>
                    <p className="text-xs text-muted">
                        Fiecare bară = o zi (UTC). Verde = ciclul zilnic a rulat. Galben = a rulat, dar n-a putut acționa (ex. sold insuficient). Roșu = eroare sau nu a rulat.
                        {!uptime.enabled && " Botul este dezactivat acum."}
                    </p>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_2.4fr]">
                <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Ultimele 7 zile</span>
                        <span className={`font-mono text-lg ${pctColor(uptime.pct7)}`}>{fmtPct(uptime.pct7, uptime.est7)}</span>
                    </div>
                    <Strip days={last7} tall />
                </div>
                <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Ultimele 30 de zile</span>
                        <span className={`font-mono text-lg ${pctColor(uptime.pct30)}`}>{fmtPct(uptime.pct30, uptime.est30)}</span>
                    </div>
                    <Strip days={uptime.days} tall />
                    <div className="mt-1 flex justify-between text-[10px] text-faint">
                        <span>{uptime.days[0]?.date}</span>
                        <span>azi</span>
                    </div>
                </div>
            </div>

            <p className="mt-3 text-[11px] text-muted">
                {uptime.est30 ? "Procentul marcat cu ~ este o estimare din istoricul de loturi (jurnalul real nu are încă zile în interval). " : ""}
                {uptime.counted30 > 0 ? `${uptime.counted30 - issues} din ${uptime.counted30} zile evaluate au mers fără probleme.` : "Încă nu sunt date suficiente."}{" "}
                {uptime.trackedSince
                    ? `Jurnalul real al rulărilor începe pe ${uptime.trackedSince}; zilele mai vechi (bare mai șterse) sunt estimate din istoricul de loturi.`
                    : "Jurnalul real al rulărilor începe cu următorul ciclu automat; până atunci zilele sunt estimate din istoricul de loturi."}
            </p>
        </Card>
    );
}
