"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Copy, Check, Trash2, Ban, RotateCcw, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import {
    listShareLinks, listShareableTokens, createShareLink, setShareLinkRevoked, deleteShareLink, listShareLinkViews,
    type ShareLinkRow, type ShareViewRow,
} from "@/app/actions/share-links";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ro-RO") : "—");

function linkState(l: ShareLinkRow): { text: string; cls: string } {
    if (l.revokedAt) return { text: "Dezactivat", cls: "text-red-300 border-red-400/30" };
    if (l.expiresAt && new Date(l.expiresAt) < new Date()) return { text: "Expirat", cls: "text-orange-300 border-orange-400/30" };
    return { text: "Activ", cls: "text-emerald-300 border-emerald-400/30" };
}

export function ShareLinksTab() {
    const [links, setLinks] = useState<ShareLinkRow[]>([]);
    const [tokens, setTokens] = useState<{ id: string; symbol: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [label, setLabel] = useState("");
    const [settingsId, setSettingsId] = useState("");
    const [days, setDays] = useState("");
    const [creating, setCreating] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [views, setViews] = useState<ShareViewRow[]>([]);
    const [viewsLoading, setViewsLoading] = useState(false);

    const reload = useCallback(async () => {
        try {
            const [l, t] = await Promise.all([listShareLinks(), listShareableTokens()]);
            setLinks(l);
            setTokens(t);
            setSettingsId((cur) => cur || (t.find((x) => x.symbol.toUpperCase().startsWith("GEOD")) ?? t[0])?.id || "");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Nu am putut încărca linkurile.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let alive = true;
        Promise.all([listShareLinks(), listShareableTokens()])
            .then(([l, t]) => {
                if (!alive) return;
                setLinks(l);
                setTokens(t);
                setSettingsId((t.find((x) => x.symbol.toUpperCase().startsWith("GEOD")) ?? t[0])?.id || "");
            })
            .catch((e) => alive && setError(e instanceof Error ? e.message : "Nu am putut încărca linkurile."))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, []);

    const urlFor = (l: ShareLinkRow) => `${window.location.origin}/api/share/${l.token}`;

    async function copy(l: ShareLinkRow) {
        try {
            await navigator.clipboard.writeText(urlFor(l));
            setCopied(l.id);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            window.prompt("Copiază linkul:", urlFor(l));
        }
    }

    async function create(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        setError(null);
        try {
            const d = days.trim() ? parseInt(days, 10) : null;
            await createShareLink({ label, settingsId, expiresInDays: d && d > 0 ? d : null });
            setLabel("");
            setDays("");
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Nu am putut crea linkul.");
        } finally {
            setCreating(false);
        }
    }

    async function toggleViews(l: ShareLinkRow) {
        if (openId === l.id) { setOpenId(null); return; }
        setOpenId(l.id);
        setViewsLoading(true);
        try { setViews(await listShareLinkViews(l.id)); } finally { setViewsLoading(false); }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="space-y-4 p-6">
                <div>
                    <h2 className="text-lg font-medium text-foreground">Linkuri de partajare</h2>
                    <p className="text-sm text-muted">
                        Un link secret care arată doar statisticile unui singur token (de exemplu GEODNET), fără login și fără acces la nimic altceva.
                        Poți să-l dezactivezi oricând și vezi cine și de unde l-a deschis.
                    </p>
                </div>
                <form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1.2fr_1fr_auto] md:items-end">
                    <label className="space-y-1">
                        <span className="text-xs text-faint">Pentru cine (etichetă)</span>
                        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Partener GEODNET" required maxLength={80}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-faint">Token</span>
                        <select value={settingsId} onChange={(e) => setSettingsId(e.target.value)} required
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                            {tokens.map((t) => <option key={t.id} value={t.id} className="bg-black">{t.symbol}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-faint">Expiră după (zile, opțional)</span>
                        <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="fără expirare"
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                    </label>
                    <Button type="submit" variant="primary" disabled={creating || !settingsId}>
                        {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Creează link
                    </Button>
                </form>
                {error && <p className="text-sm text-red-300">{error}</p>}
                {!loading && tokens.length === 0 && <p className="text-sm text-muted">Nu ai niciun token Polygon configurat încă.</p>}
            </Card>

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : links.length === 0 ? (
                <Card className="p-6"><p className="text-sm text-muted">Niciun link creat încă.</p></Card>
            ) : (
                links.map((l) => {
                    const st = linkState(l);
                    return (
                        <Card key={l.id} className="space-y-4 p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-medium text-foreground">{l.label}</h3>
                                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-muted">{l.tokenSymbol}</span>
                                        <span className={cn("rounded-full border px-2 py-0.5 text-xs", st.cls)}>{st.text}</span>
                                    </div>
                                    <p className="text-xs text-faint">
                                        Creat {fmt(l.createdAt)}{l.expiresAt ? ` · expiră ${fmt(l.expiresAt)}` : " · fără expirare"}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => copy(l)}>
                                        {copied === l.id ? <Check className="mr-1.5 h-3.5 w-3.5 text-accent" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                                        {copied === l.id ? "Copiat" : "Copiază link"}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={async () => { await setShareLinkRevoked(l.id, !l.revokedAt); reload(); }}>
                                        {l.revokedAt ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <Ban className="mr-1.5 h-3.5 w-3.5" />}
                                        {l.revokedAt ? "Reactivează" : "Dezactivează"}
                                    </Button>
                                    <Button variant="danger" size="sm" onClick={async () => {
                                        if (!window.confirm("Ștergi linkul și tot istoricul lui de accesări?")) return;
                                        await deleteShareLink(l.id); if (openId === l.id) setOpenId(null); reload();
                                    }}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <code className="block break-all rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-muted">{typeof window !== "undefined" ? urlFor(l) : `/api/share/${l.token}`}</code>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                <div><p className="text-xs text-faint">Accesări</p><p className="font-mono text-xl text-foreground">{l.views}</p></div>
                                <div><p className="text-xs text-faint">Vizitatori unici</p><p className="font-mono text-xl text-foreground">{l.uniqueVisitors}</p></div>
                                <div><p className="text-xs text-faint">Ultima accesare</p><p className="text-sm text-foreground">{fmt(l.lastViewAt)}</p></div>
                                <div><p className="text-xs text-faint">Previzualizări (roboți)</p><p className="font-mono text-xl text-faint">{l.botHits}</p></div>
                            </div>
                            <button type="button" onClick={() => toggleViews(l)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                {openId === l.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                Istoric accesări
                            </button>
                            {openId === l.id && (
                                viewsLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> :
                                views.length === 0 ? <p className="text-sm text-muted">Nicio accesare încă.</p> : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[640px] text-sm">
                                            <thead>
                                                <tr className="border-b border-white/10 text-left text-xs text-faint">
                                                    <th className="py-2 pr-3 font-medium">Data</th><th className="px-3 py-2 font-medium">Locație</th>
                                                    <th className="px-3 py-2 font-medium">Dispozitiv</th><th className="px-3 py-2 font-medium">IP (mascat)</th>
                                                    <th className="px-3 py-2 font-medium">Din</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {views.map((v) => (
                                                    <tr key={v.id} className={cn("border-b border-white/[0.05]", v.isBot && "opacity-50")}>
                                                        <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted">{fmt(v.createdAt)}{v.isBot ? " · robot" : ""}</td>
                                                        <td className="whitespace-nowrap px-3 py-2 text-foreground">{[v.city, v.region, v.country].filter(Boolean).join(", ") || "—"}</td>
                                                        <td className="whitespace-nowrap px-3 py-2 text-muted">{[v.device, v.os, v.browser].filter(Boolean).join(" · ") || "—"}</td>
                                                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-faint">{v.ipMasked ?? "—"}</td>
                                                        <td className="whitespace-nowrap px-3 py-2 text-xs text-faint">{v.referrer ?? "direct"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            )}
                        </Card>
                    );
                })
            )}
        </div>
    );
}
