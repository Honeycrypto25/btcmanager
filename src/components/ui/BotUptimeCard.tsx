"use client";

import React from "react";
import { Card } from "@/components/ui/core";

export interface UptimeDayDTO {
    date: string;
    status: "ok" | "idle" | "warn" | "error" | "missed" | "pending" | "nodata";
    source: "log" | "lots" | "none";
    note?: string;
}
export interface StrikeWindowDTO {
    pct: number | null;
    executed: number;
    opportunities: number;
    noFuel: number;
    unknown: number;
}
export interface BotUptimeDTO {
    bot: string;
    label: string;
    enabled: boolean;
    trackedSince: string | null;
    days: UptimeDayDTO[];
    w7: StrikeWindowDTO;
    w30: StrikeWindowDTO;
}

const COLOR: Record<UptimeDayDTO["status"], string> = {
    ok: "bg-emerald-500",
    idle: "bg-emerald-500/25",
    warn: "bg-amber-400",
    error: "bg-red-500",
    missed: "bg-red-500/45",
    pending: "bg-white/25",
    nodata: "bg-white/[0.07]",
};
const LABEL: Record<UptimeDayDTO["status"], string> = {
    ok: "ordin executat",
    idle: "a rulat — niciun ordin scadent",
    warn: "fără combustibil (sold insuficient)",
    error: "eroare — ordinul nu a fost plasat",
    missed: "botul nu a rulat",
    pending: "în așteptare",
    nodata: "fără date",
};

export function pctColor(p: number | null) {
    if (p === null) return "text-muted";
    return p >= 99 ? "text-emerald-300" : p >= 90 ? "text-amber-300" : "text-red-400";
}
export const fmtPct = (p: number | null) => (p === null ? "—" : `${p >= 99.95 ? 100 : p.toFixed(1)}%`);

/** "7/7 execuții · 2 fără combustibil · 16 fără date" */
export function strikeDetail(w: StrikeWindowDTO): string {
    const parts = [`${w.executed}/${w.opportunities} execuții`];
    if (w.noFuel > 0) parts.push(`${w.noFuel} fără combustibil`);
    if (w.unknown > 0) parts.push(`${w.unknown} fără date`);
    return parts.join(" · ");
}

export function Strip({ days, tall }: { days: UptimeDayDTO[]; tall?: boolean }) {
    return (
        <div className="flex gap-[3px]">
            {days.map((d) => (
                <div
                    key={d.date}
                    title={`${d.date} · ${LABEL[d.status]}${d.note && d.note !== LABEL[d.status] ? `\n${d.note}` : ""}`}
                    className={`${tall ? "h-11" : "h-9"} flex-1 rounded-[3px] ${COLOR[d.status]}`}
                />
            ))}
        </div>
    );
}

/** Activity strip: last 7 and 30 days; strike = executed orders ÷ days the bot had fuel and an order due. */
export function BotUptimeCard({ uptime }: { uptime: BotUptimeDTO }) {
    const last7 = uptime.days.slice(-7);
    return (
        <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-medium text-foreground">Activitatea botului · {uptime.label}</h2>
                    <p className="text-xs text-muted">
                        Fiecare bară = o zi (UTC). Verde = ordin executat. Verde șters = a rulat, dar nu era niciun ordin scadent. Galben = fără combustibil (sold insuficient). Roșu = avea
                        combustibil, dar ordinul a eșuat sau botul nu a rulat. Gri = fără date.
                        {!uptime.enabled && " Botul este dezactivat acum."}
                    </p>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_2.4fr]">
                <div>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Ultimele 7 zile</span>
                        <span className={`font-mono text-lg ${pctColor(uptime.w7.pct)}`}>{fmtPct(uptime.w7.pct)}</span>
                    </div>
                    <Strip days={last7} tall />
                    <div className="mt-1 text-[11px] text-muted">{strikeDetail(uptime.w7)}</div>
                </div>
                <div>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Ultimele 30 de zile</span>
                        <span className={`font-mono text-lg ${pctColor(uptime.w30.pct)}`}>{fmtPct(uptime.w30.pct)}</span>
                    </div>
                    <Strip days={uptime.days} tall />
                    <div className="mt-1 flex justify-between gap-3 text-[11px] text-muted">
                        <span>{strikeDetail(uptime.w30)}</span>
                        <span className="shrink-0 text-[10px] text-faint">{uptime.days[0]?.date} → azi</span>
                    </div>
                </div>
            </div>

            <p className="mt-3 text-[11px] text-muted">
                Procentul = ordine executate din zilele în care botul avea combustibil și un ordin de plasat. Zilele fără combustibil și cele fără date nu intră în calcul.{" "}
                {uptime.trackedSince
                    ? `Jurnalul rulărilor începe pe ${uptime.trackedSince}; pentru zilele mai vechi se știe doar dacă s-a executat un ordin, nu și dacă botul avea combustibil.`
                    : "Jurnalul rulărilor începe cu următorul ciclu automat; până atunci se știe doar în ce zile s-a executat un ordin."}
            </p>
        </Card>
    );
}
