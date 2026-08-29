"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Sparkles, Play, Save, AlertTriangle, Wallet, Pencil, X, BarChart3, Send, ShieldAlert, ArrowRight } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import { upsertEvaSettings, runEvaDcaNow, runEvaSweepNow, type EvaSettingsInput } from "@/app/actions/eva";
import { formatUsd, type SettingsDTO } from "./shared";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/** Vercel Cron for /api/cron/eva-dca runs daily at 09:40 UTC (see vercel.json) — this just mirrors that schedule for display. */
function nextCronRunUtc(): Date {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 40, 0));
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

export function EvaClient({
    initialSettings,
    evaPriceUsd,
    botWallet,
    sweepDestination,
}: {
    initialSettings: SettingsDTO | null;
    evaPriceUsd: number | null;
    botWallet: { address: string } | { error: string };
    sweepDestination: { address: string } | { error: string };
}) {
    const isAdmin = useIsAdmin();
    const [settings, setSettings] = useState<SettingsDTO | null>(initialSettings);
    const [form, setForm] = useState<EvaSettingsInput>({
        enabled: initialSettings?.enabled ?? false,
        buyAmountUsd: initialSettings ? Number(initialSettings.buyAmountUsd) : 10,
        intervalHours: initialSettings?.intervalHours ?? 24,
        // 11.11%, not a round 10% — selling $10 worth of EVA at a target
        // price of buyPrice * 1.1111 recovers exactly the $10 invested
        // while only selling 1/1.1111 = 90% of the tokens acquired, i.e.
        // "get my USDC back and keep 10% of the tokens as profit". See the
        // matching comment in src/app/actions/eva.ts for the full derivation.
        takeProfitPercent: initialSettings ? Number(initialSettings.takeProfitPercent) : 11.11,
        sellAmountUsd: initialSettings ? Number(initialSettings.sellAmountUsd) : 10,
        // 500 bps (5%) default, not SOL's 50 (0.5%) — EVA's on-chain
        // liquidity is thin, so it needs more slippage headroom.
        slippageBps: initialSettings?.slippageBps ?? 500,
        sweepEnabled: initialSettings?.sweepEnabled ?? false,
        sweepMinBalanceEva: initialSettings ? Number(initialSettings.sweepMinBalanceEva) : 0,
    });
    const [editing, setEditing] = useState(!initialSettings);
    const [saving, startSaving] = useTransition();
    const [running, startRunning] = useTransition();
    const [sweeping, startSweeping] = useTransition();
    const [runMessage, setRunMessage] = useState<string | null>(null);
    const [sweepMessage, setSweepMessage] = useState<string | null>(null);
    const [showSweepConfirm, setShowSweepConfirm] = useState(false);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function handleSave() {
        setError(null);
        setSavedMessage(null);
        startSaving(async () => {
            try {
                const saved = await upsertEvaSettings(form);
                setSettings(JSON.parse(JSON.stringify(saved)));
                setSavedMessage(`Salvat — ${new Date().toLocaleTimeString("ro-RO")}.`);
                setEditing(false);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la salvare.");
            }
        });
    }

    function handleCancelEdit() {
        if (settings) {
            setForm({
                enabled: settings.enabled,
                buyAmountUsd: Number(settings.buyAmountUsd),
                intervalHours: settings.intervalHours,
                takeProfitPercent: Number(settings.takeProfitPercent),
                sellAmountUsd: Number(settings.sellAmountUsd),
                slippageBps: settings.slippageBps,
                sweepEnabled: settings.sweepEnabled,
                sweepMinBalanceEva: Number(settings.sweepMinBalanceEva),
            });
        }
        setError(null);
        setEditing(false);
    }

    function handleSweepNow() {
        setShowSweepConfirm(true);
    }

    function confirmSweepNow() {
        setShowSweepConfirm(false);
        setSweepMessage(null);
        setError(null);
        startSweeping(async () => {
            try {
                const result = await runEvaSweepNow();
                if (result.action === "sent") setSweepMessage(`Trimis ${result.amountEva} EVA — pagina se va reîmprospăta.`);
                else if (result.action === "skipped") setSweepMessage(`Sărit: ${result.reason}`);
                else setError(result.reason ?? "Eroare necunoscută.");
                if (result.action === "sent") window.location.reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la trimitere.");
            }
        });
    }

    function handleRunNow() {
        setRunMessage(null);
        setError(null);
        startRunning(async () => {
            try {
                const result = await runEvaDcaNow();
                if (result.action === "bought") setRunMessage("Achiziție executată — pagina se va reîmprospăta.");
                else if (result.action === "skipped") setRunMessage(`Sărit: ${result.reason}`);
                else setError(result.reason ?? "Eroare necunoscută.");
                if (result.action === "bought") window.location.reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la rulare.");
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="font-display text-xl font-medium text-foreground">Eva — DCA automat</h1>
                        <p className="text-sm text-muted">
                            {evaPriceUsd ? `Preț curent: ${formatUsd(evaPriceUsd)}` : "Preț curent indisponibil momentan"}
                        </p>
                    </div>
                </div>
                <Link href="/solana/eva/stats">
                    <Button variant="secondary" size="sm">
                        <BarChart3 className="h-4 w-4" /> Statistici
                    </Button>
                </Link>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                    Lichiditate redusă pe EVA (pool mic, puțini deținători) — slippage-ul implicit e setat la 5% (500 bps), mult peste cel de la SOL (0.5%), ca swap-urile să nu eșueze din cauza mișcării de preț dintre cotație și execuție. Poți ajusta valoarea mai jos, dar un slippage prea mic va face cumpărările să eșueze frecvent.
                </span>
            </div>

            {/* Status */}
            <Card className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="relative flex h-3 w-3">
                            {settings?.enabled && (
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            )}
                            <span className={cn("relative inline-flex h-3 w-3 rounded-full", settings?.enabled ? "bg-emerald-400" : "bg-white/20")} />
                        </span>
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                {settings?.enabled ? "Bot activ" : "Bot inactiv"}
                            </p>
                            <p className="text-xs text-faint">
                                {settings
                                    ? `${settings.walletAddress.slice(0, 4)}...${settings.walletAddress.slice(-4)} · $${settings.buyAmountUsd}/${settings.intervalHours}h · țintă +${settings.takeProfitPercent}%`
                                    : "Nesalvat încă"}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs text-faint sm:text-right">
                        <span>
                            Ultima rulare: {settings?.lastRunAt ? format(new Date(settings.lastRunAt), "d MMM, HH:mm") : "niciodată încă"}
                            {settings?.lastRunStatus ? ` · ${settings.lastRunStatus}` : ""}
                        </span>
                        {settings?.enabled && (
                            <span>Următoarea verificare automată: {format(nextCronRunUtc(), "d MMM, HH:mm")} UTC</span>
                        )}
                        {settings?.lastRunError && <span className="text-red-300">{settings.lastRunError}</span>}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-3">
                    {isAdmin && (
                        <Button onClick={handleRunNow} disabled={running || !settings} variant="secondary" size="sm">
                            <Play className="h-4 w-4" /> {running ? "Se rulează..." : "Rulează acum, ca să verific că totul e în regulă"}
                        </Button>
                    )}
                    {runMessage && <span className="text-sm text-muted">{runMessage}</span>}
                    {error && <span className="text-sm text-red-300">{error}</span>}
                    {!settings && isAdmin && <span className="text-xs text-faint">Salvează întâi setările mai jos.</span>}
                </div>
            </Card>

            {/* Settings */}
            <Card className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-medium text-foreground">Setări</h2>
                        {settings && !editing && isAdmin && (
                            <Button onClick={() => setEditing(true)} variant="outline" size="sm">
                                <Pencil className="h-3.5 w-3.5" /> Editează
                            </Button>
                        )}
                        {editing && settings && (
                            <Button onClick={handleCancelEdit} variant="ghost" size="sm">
                                <X className="h-3.5 w-3.5" /> Anulează
                            </Button>
                        )}
                    </div>
                    <label className={cn("flex items-center gap-2 text-sm", editing ? "text-muted" : "text-faint")}>
                        <input
                            type="checkbox"
                            checked={form.enabled}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                            className="h-4 w-4 accent-primary rounded border-white/20 bg-transparent disabled:opacity-50"
                        />
                        Activ
                    </label>
                </div>
                {settings && !editing && (
                    <p className="text-xs text-faint">
                        Parametrii sunt blocați ca să nu-i modifici din greșeală cât timp botul e configurat. Apasă „Editează” pentru a-i schimba — istoricul de loturi (vezi Statistici) nu e afectat niciodată de o modificare de setări.
                    </p>
                )}

                {"error" in botWallet ? (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            <code>SOLANA_PRIVATE_KEY</code> nu e configurată încă în Vercel — setează-o, apoi revino aici. ({botWallet.error})
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
                        <Wallet className="h-4 w-4 text-muted" />
                        <span className="text-faint">Portofel (același ca la SOL, derivat din cheia din Vercel):</span>
                        <code className="text-foreground">{botWallet.address}</code>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Sumă cumpărare per ciclu ($)">
                        <input
                            type="number"
                            step="0.01"
                            value={form.buyAmountUsd}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, buyAmountUsd: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
                        />
                    </Field>
                    <Field label="Interval (ore)">
                        <input
                            type="number"
                            value={form.intervalHours}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, intervalHours: parseInt(e.target.value) || 1 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
                        />
                    </Field>
                    <Field label="Țintă de creștere pentru vânzare (%)">
                        <input
                            type="number"
                            step="0.01"
                            value={form.takeProfitPercent}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, takeProfitPercent: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
                        />
                    </Field>
                    <Field label="Sumă de vânzare la țintă ($)">
                        <input
                            type="number"
                            step="0.01"
                            value={form.sellAmountUsd}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, sellAmountUsd: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
                        />
                    </Field>
                    <Field label="Slippage la cumpărare (bps, 500 = 5%)">
                        <input
                            type="number"
                            value={form.slippageBps}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, slippageBps: parseInt(e.target.value) || 500 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
                        />
                    </Field>
                </div>

                {error && <p className="text-sm text-red-300">{error}</p>}
                {savedMessage && (
                    <p className="flex items-center gap-1.5 text-sm text-emerald-300">
                        {savedMessage} (Activ: {form.enabled ? "da" : "nu"})
                    </p>
                )}
                {runMessage && <p className="text-sm text-muted">{runMessage}</p>}

                {isAdmin && (
                    <div className="flex flex-wrap gap-3">
                        {editing && (
                            <Button onClick={handleSave} disabled={saving || "error" in botWallet} variant="primary">
                                <Save className="h-4 w-4" /> {saving ? "Se salvează..." : "Salvează setările"}
                            </Button>
                        )}
                        <Button onClick={handleRunNow} disabled={running || !settings} variant="secondary">
                            <Play className="h-4 w-4" /> {running ? "Se rulează..." : "Rulează acum (test)"}
                        </Button>
                    </div>
                )}
                <p className="text-xs text-faint">
                    Portofelul trebuie să aibă în prealabil USDC (pentru cumpărare) și puțin SOL (pentru fee-uri de rețea) — este ACELAȘI portofel folosit de botul SOL.
                    Cheia privată se citește din variabila de mediu <code>SOLANA_PRIVATE_KEY</code> din Vercel — nu e stocată în baza de date.
                </p>
            </Card>

            {/* Retragere automată lunară — parte din același formular/salvare ca secțiunea Setări de mai sus, blocată de același comutator Editează */}
            <Card className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-medium text-foreground">Retragere automată lunară</h2>
                        {settings && !editing && isAdmin && (
                            <Button onClick={() => setEditing(true)} variant="outline" size="sm">
                                <Pencil className="h-3.5 w-3.5" /> Editează
                            </Button>
                        )}
                        {editing && settings && (
                            <Button onClick={handleCancelEdit} variant="ghost" size="sm">
                                <X className="h-3.5 w-3.5" /> Anulează
                            </Button>
                        )}
                    </div>
                    <label className={cn("flex items-center gap-2 text-sm", editing ? "text-muted" : "text-faint")}>
                        <input
                            type="checkbox"
                            checked={form.sweepEnabled}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, sweepEnabled: e.target.checked })}
                            className="h-4 w-4 accent-primary rounded border-white/20 bg-transparent disabled:opacity-50"
                        />
                        Activ
                    </label>
                </div>
                <p className="text-xs text-faint">
                    În fiecare zi de 2 a lunii, tot ce depășește minimul de mai jos se trimite automat (ca transfer de token SPL) către ACELAȘI portofel de retragere folosit de botul SOL — restul rămâne pentru cumpărări viitoare. Suma trimisă e rotunjită în jos la 2 zecimale, deci minimul e mereu respectat (posibil cu un mic surplus). Fee-ul de rețea se plătește tot în SOL, indiferent de soldul de EVA — de-aia minimul de mai jos poate fi 0 fără riscul de a rămâne fără combustibil pentru tranzacții.
                </p>
                {settings && !editing && (
                    <p className="text-xs text-faint">
                        Blocat împreună cu Setările de mai sus — apasă „Editează” (aici sau acolo) ca să activezi retragerea sau să schimbi minimul.
                    </p>
                )}

                {"error" in sweepDestination ? (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            <code>SOLANA_SWEEP_DESTINATION</code> nu e configurată încă în Vercel — setează-o, apoi revino aici. Retragerea rămâne dezactivată până atunci, indiferent de comutatorul de mai sus.
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
                        <ShieldAlert className="h-4 w-4 text-muted" />
                        <span className="text-faint">Portofel de retragere (același ca la SOL, din Vercel, needitabil aici):</span>
                        <code className="text-foreground">{sweepDestination.address}</code>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Minim EVA păstrat mereu în portofelul botului">
                        <input
                            type="number"
                            step="0.01"
                            value={form.sweepMinBalanceEva}
                            disabled={!editing}
                            onChange={(e) => setForm({ ...form, sweepMinBalanceEva: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
                        />
                    </Field>
                </div>

                <div className="flex flex-col gap-0.5 text-xs text-faint">
                    <span>
                        Ultima retragere: {settings?.lastSweepAt ? format(new Date(settings.lastSweepAt), "d MMM, HH:mm") : "niciodată încă"}
                        {settings?.lastSweepStatus ? ` · ${settings.lastSweepStatus}` : ""}
                    </span>
                    {settings?.lastSweepError && <span className="text-red-300">{settings.lastSweepError}</span>}
                </div>

                {sweepMessage && <p className="text-sm text-muted">{sweepMessage}</p>}

                {isAdmin && (
                    <div className="flex flex-wrap gap-3">
                        {editing && (
                            <Button onClick={handleSave} disabled={saving || "error" in botWallet} variant="primary">
                                <Save className="h-4 w-4" /> {saving ? "Se salvează..." : "Salvează"}
                            </Button>
                        )}
                        <Button
                            onClick={handleSweepNow}
                            disabled={sweeping || !settings || "error" in sweepDestination}
                            variant="secondary"
                        >
                            <Send className="h-4 w-4" /> {sweeping ? "Se trimite..." : "Trimite acum (test)"}
                        </Button>
                    </div>
                )}
            </Card>

            {showSweepConfirm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-6">
                    <Card className="max-w-md w-full space-y-5 border-amber-400/30">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-300">
                                <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-foreground">Confirmă trimiterea</h3>
                                <p className="mt-1 text-xs text-faint">
                                    Se trimite o tranzacție reală și ireversibilă pe blockchain-ul Solana (transfer de token SPL).
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-faint">Rămâne mereu</span>
                                <span className="font-medium text-foreground">{form.sweepMinBalanceEva} EVA</span>
                            </div>
                            <div className="flex items-center gap-2 text-faint">
                                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs">Excedentul de peste minim, rotunjit în jos la 2 zecimale</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2">
                                <span className="text-faint">Către</span>
                                <code className="text-xs text-foreground break-all text-right">
                                    {"error" in sweepDestination ? "—" : sweepDestination.address}
                                </code>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <Button variant="ghost" size="sm" onClick={() => setShowSweepConfirm(false)}>
                                Anulează
                            </Button>
                            <Button variant="primary" size="sm" onClick={confirmSweepNow}>
                                <Send className="h-3.5 w-3.5" /> Trimite acum
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs text-faint">{label}</span>
            {children}
        </label>
    );
}
