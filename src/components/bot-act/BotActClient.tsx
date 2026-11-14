"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/core";
import { Strip, fmtPct, pctColor, type BotUptimeDTO } from "@/components/ui/BotUptimeCard";

export interface BotActivityDTO {
    bot: string;
    label: string;
    enabled: boolean;
    lastOrderPlacedAt: string | null;
    lastCheckedAt: string | null;
    lastFinalizedAt: string | null;
    finalized30d: number;
    profit30d: number;
    uptime: BotUptimeDTO;
}

function ago(d: Date, now: number): string {
    const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
    if (s < 60) return "chiar acum";
    const m = Math.round(s / 60);
    if (m < 60) return `acum ${m} ${m === 1 ? "minut" : "minute"}`;
    const h = Math.round(m / 60);
    if (h < 48) return `acum ${h} ${h === 1 ? "oră" : "ore"}`;
    const days = Math.round(h / 24);
    return `acum ${days} zile`;
}

function When({ iso, now }: { iso: string | null; now: number }) {
    if (!iso) return <span className="text-faint">—</span>;
    const d = new Date(iso);
    return (
        <span className="text-right">
            <span className="font-medium text-foreground">
                {d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}, {d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="ml-2 text-xs text-muted">{ago(d, now)}</span>
        </span>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5 border-t border-white/[0.06] py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <span className="text-sm text-muted">{label}</span>
            {children}
        </div>
    );
}

function Strike({ pct, counted, days, est }: { pct: number | null; counted: number; days: BotUptimeDTO["days"]; est?: boolean }) {
    return (
        <div className="flex items-center gap-3 sm:w-[60%]">
            <div className="min-w-0 flex-1">
                <Strip days={days} />
            </div>
            <span className={`w-16 shrink-0 text-right font-mono text-base ${pctColor(pct)}`} title={`${counted} zile evaluate${est ? " (estimat din loturi)" : ""}`}>
                {fmtPct(pct, est)}
            </span>
        </div>
    );
}

const DAY_MS = 86_400_000;
const REFRESH_MS = 60_000;
const SHOW_INACTIVE_KEY = "botAct.showInactive";

export function BotActClient({ bots }: { bots: BotActivityDTO[] }) {
    const router = useRouter();
    const [now, setNow] = useState(() => Date.now());
    const [showInactive, setShowInactive] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(() => Date.now());

    // Remember the checkbox between visits (best effort — storage can be unavailable).
    useEffect(() => {
        try {
            setShowInactive(localStorage.getItem(SHOW_INACTIVE_KEY) === "1");
        } catch {}
    }, []);
    const toggleInactive = (v: boolean) => {
        setShowInactive(v);
        try {
            localStorage.setItem(SHOW_INACTIVE_KEY, v ? "1" : "0");
        } catch {}
    };

    // Live page: re-fetch the server data every minute and keep the "acum X" labels ticking.
    useEffect(() => {
        const id = setInterval(() => {
            router.refresh();
            setNow(Date.now());
            setUpdatedAt(Date.now());
        }, REFRESH_MS);
        return () => clearInterval(id);
    }, [router]);

    const refreshNow = () => {
        router.refresh();
        setNow(Date.now());
        setUpdatedAt(Date.now());
    };

    const { visible, hiddenCount } = useMemo(() => {
        const shown = bots.filter((b) => b.enabled || showInactive);
        // Oldest last-placed order first; a bot that never placed one is the oldest of all.
        const age = (b: BotActivityDTO) => (b.lastOrderPlacedAt ? new Date(b.lastOrderPlacedAt).getTime() : -Infinity);
        shown.sort((a, b) => age(a) - age(b));
        return { visible: shown, hiddenCount: bots.length - bots.filter((b) => b.enabled).length };
    }, [bots, showInactive]);

    const isStale = (b: BotActivityDTO) => !b.lastOrderPlacedAt || now - new Date(b.lastOrderPlacedAt).getTime() > DAY_MS;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Bot Act.</h1>
                    <p className="mt-1 text-sm text-muted">
                        Boții sunt sortați după ultimul ordin plasat: cel mai vechi e primul. Cei fără ordin nou de peste o zi sunt marcați cu galben. Pagina se actualizează singură la un minut.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted hover:text-foreground">
                        <input type="checkbox" checked={showInactive} onChange={(e) => toggleInactive(e.target.checked)} className="accent-emerald-500" />
                        Arată și boții inactivi{hiddenCount > 0 ? ` (${hiddenCount})` : ""}
                    </label>
                    <button
                        type="button"
                        onClick={refreshNow}
                        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground"
                        title={`Actualizat la ${new Date(updatedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
                    >
                        Actualizează
                    </button>
                </div>
            </div>

            {visible.length === 0 && (
                <Card>
                    <p className="text-sm text-muted">{bots.length === 0 ? "Niciun bot configurat încă." : "Niciun bot activ. Bifează „Arată și boții inactivi” ca să-i vezi pe toți."}</p>
                </Card>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
                {visible.map((b) => {
                    const stale = b.enabled && isStale(b);
                    return (
                        <Card key={b.bot} className={stale ? "!border-amber-400/40" : undefined}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <h2 className="text-base font-medium text-foreground">{b.label}</h2>
                                <div className="flex items-center gap-2">
                                    {stale && <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">{b.lastOrderPlacedAt ? "Ordin mai vechi de o zi" : "Niciun ordin plasat"}</span>}
                                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${b.enabled ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-muted"}`}>
                                        {b.enabled ? "Activ" : "Dezactivat"}
                                    </span>
                                </div>
                            </div>
                            <Row label="Data ultimului ordin plasat"><When iso={b.lastOrderPlacedAt} now={now} /></Row>
                            <Row label="Data ultimei verificări"><When iso={b.lastCheckedAt} now={now} /></Row>
                            <Row label="Data ultimului ordin finalizat"><When iso={b.lastFinalizedAt} now={now} /></Row>
                            <Row label="Ordine finalizate · ultimele 30 de zile">
                                <span className="font-medium text-foreground">{b.finalized30d}</span>
                            </Row>
                            <Row label="Profit · ultimele 30 de zile">
                                <span className={`font-mono text-base font-medium ${b.profit30d > 0 ? "text-emerald-300" : b.profit30d < 0 ? "text-red-300" : "text-muted"}`}>
                                    {b.profit30d < 0 ? "−" : b.profit30d > 0 ? "+" : ""}${Math.abs(b.profit30d).toFixed(2)}
                                </span>
                            </Row>
                            <Row label="Strike 7 zile"><Strike pct={b.uptime.pct7} counted={b.uptime.counted7} est={b.uptime.est7} days={b.uptime.days.slice(-7)} /></Row>
                            <Row label="Strike 30 de zile"><Strike pct={b.uptime.pct30} counted={b.uptime.counted30} est={b.uptime.est30} days={b.uptime.days} /></Row>
                        </Card>
                    );
                })}
            </div>
            <p className="text-xs text-muted">Strike = procentul de zile în care ciclul zilnic al botului a rulat fără probleme. Barele mai șterse sunt zile estimate din istoricul de loturi; procentul marcat cu ~ este estimat și devine exact după ce jurnalul real al rulărilor acoperă intervalul (primele înregistrări apar la următorul cron).</p>
        </div>
    );
}
