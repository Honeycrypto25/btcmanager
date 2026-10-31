"use client";

import React, { useMemo, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import { syncFcsbFixtures } from "@/app/actions/fcsb";

export interface FixtureDTO {
    id: string;
    kickoff: string;
    league: string;
    round: string | null;
    homeId: number;
    homeName: string;
    awayName: string;
    homeGoals: number | null;
    awayGoals: number | null;
    statusShort: string;
    statusLong: string;
    venue: string | null;
}

const FINISHED = new Set(["FT", "AET", "PEN"]);
const OFF = new Set(["PST", "CANC", "ABD", "AWD", "WO"]);

function outcome(f: FixtureDTO, teamId: number): "W" | "D" | "L" | null {
    if (!FINISHED.has(f.statusShort) || f.homeGoals == null || f.awayGoals == null) return null;
    const mine = f.homeId === teamId ? f.homeGoals : f.awayGoals;
    const theirs = f.homeId === teamId ? f.awayGoals : f.homeGoals;
    return mine > theirs ? "W" : mine < theirs ? "L" : "D";
}

const OUT_CLS = { W: "text-emerald-300 border-emerald-400/30", D: "text-amber-300 border-amber-400/30", L: "text-red-300 border-red-400/30" } as const;
const OUT_TXT = { W: "Victorie", D: "Egal", L: "Înfrângere" } as const;
const fmtDate = (iso: string) => new Date(iso).toLocaleString("ro-RO", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function FcsbClient({ fixtures, teamId, lastSync }: { fixtures: FixtureDTO[]; teamId: number; lastSync: string | null }) {
    const [pending, start] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const { upcoming, played, record } = useMemo(() => {
        const up = fixtures.filter((f) => !FINISHED.has(f.statusShort) && !OFF.has(f.statusShort));
        const pl = fixtures.filter((f) => FINISHED.has(f.statusShort)).reverse();
        const rec = { W: 0, D: 0, L: 0 };
        for (const f of pl) { const o = outcome(f, teamId); if (o) rec[o]++; }
        return { upcoming: up, played: pl, record: rec };
    }, [fixtures, teamId]);

    function sync() {
        setMsg(null);
        start(async () => {
            try {
                const r = await syncFcsbFixtures();
                setMsg({ ok: r.ok, text: r.message });
            } catch (e) {
                setMsg({ ok: false, text: e instanceof Error ? e.message : "Sincronizarea a eșuat." });
            }
        });
    }

    const Row = ({ f }: { f: FixtureDTO }) => {
        const o = outcome(f, teamId);
        const home = f.homeId === teamId;
        return (
            <tr className="border-b border-white/[0.05]">
                <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted">{fmtDate(f.kickoff)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-faint">{f.league}{f.round ? ` · ${f.round}` : ""}</td>
                <td className="px-3 py-2.5 text-foreground">
                    <span className={home ? "font-medium" : ""}>{f.homeName}</span>
                    <span className="mx-2 text-faint">vs</span>
                    <span className={!home ? "font-medium" : ""}>{f.awayName}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-foreground">
                    {f.homeGoals != null && f.awayGoals != null ? `${f.homeGoals} - ${f.awayGoals}` : "—"}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 text-right">
                    {o ? <span className={cn("rounded-full border px-2 py-0.5 text-xs", OUT_CLS[o])}>{OUT_TXT[o]}</span>
                        : <span className="text-xs text-faint">{f.statusLong}</span>}
                </td>
            </tr>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Fotbal</p>
                    <h1 className="font-display text-2xl font-medium text-foreground">FCSB · meciuri</h1>
                    <p className="text-sm text-muted">
                        Program și rezultate din TheSportsDB.{lastSync ? ` Ultima actualizare: ${new Date(lastSync).toLocaleString("ro-RO")}.` : " Nu s-a sincronizat încă."}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={sync} disabled={pending}>
                    <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", pending && "animate-spin")} />
                    {pending ? "Se actualizează..." : "Actualizează meciurile"}
                </Button>
            </div>

            {msg && (
                <Card className={cn("p-4 text-sm", msg.ok ? "border-emerald-500/20 text-emerald-300" : "border-red-500/20 text-red-300")}>
                    {msg.text}
                </Card>
            )}

            {fixtures.length === 0 ? (
                <Card className="p-6">
                    <p className="text-sm text-muted">Niciun meci salvat încă. Apasă „Actualizează meciurile” ca să îl încarci din TheSportsDB.</p>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <Card className="p-4"><p className="text-xs text-faint">Meciuri jucate</p><p className="font-mono text-2xl text-foreground">{played.length}</p></Card>
                        <Card className="p-4"><p className="text-xs text-faint">Victorii</p><p className="font-mono text-2xl text-emerald-300">{record.W}</p></Card>
                        <Card className="p-4"><p className="text-xs text-faint">Egaluri</p><p className="font-mono text-2xl text-amber-300">{record.D}</p></Card>
                        <Card className="p-4"><p className="text-xs text-faint">Înfrângeri</p><p className="font-mono text-2xl text-red-300">{record.L}</p></Card>
                    </div>

                    <Card className="space-y-3 p-6">
                        <h2 className="text-sm font-medium text-foreground">Următoarele meciuri ({upcoming.length})</h2>
                        {upcoming.length === 0 ? <p className="text-sm text-muted">Niciun meci programat în datele salvate.</p> : (
                            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><tbody>{upcoming.map((f) => <Row key={f.id} f={f} />)}</tbody></table></div>
                        )}
                    </Card>

                    <Card className="space-y-3 p-6">
                        <h2 className="text-sm font-medium text-foreground">Rezultate ({played.length})</h2>
                        {played.length === 0 ? <p className="text-sm text-muted">Niciun meci jucat în datele salvate.</p> : (
                            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><tbody>{played.map((f) => <Row key={f.id} f={f} />)}</tbody></table></div>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}
