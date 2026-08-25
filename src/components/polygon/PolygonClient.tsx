"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Repeat, Play, Save, AlertTriangle, Wallet, Pencil, X, BarChart3, Send, ArrowRight, Plus, RefreshCw } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import {
    addPolygonToken,
    updatePolygonTokenSettings,
    runPolygonDcaNow,
    reconcilePolygonOrdersNow,
    updatePolygonSweepSettings,
    runPolygonSweepNow,
    type PolygonTokenSettingsInput,
} from "@/app/actions/polygon";
import { ALLOWED_TOKENS } from "@/lib/polygon/constants";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface TokenSettingsDTO {
    id: string;
    enabled: boolean;
    tokenAddress: string;
    tokenSymbol: string;
    tokenDecimals: number;
    walletAddress: string;
    sellAmountUsd: string;
    intervalHours: number;
    buybackDipPercent: string;
    slippageBps: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunError: string | null;
}

type SweepSettingsDTO = {
    enabled: boolean;
    lastSweepAt: string | null;
    lastSweepStatus: string | null;
    lastSweepError: string | null;
} | null;

interface Props {
    initialTokenSettings: TokenSettingsDTO[];
    botWallet: { address: string } | { error: string };
    gasStatus: { nativeBalance: number } | { error: string };
    usdcStatus: { usdcBalance: number } | { error: string };
    sweepSettings: SweepSettingsDTO;
    sweepDestination: { address: string } | { error: string };
}

function fmtUsd(n: number): string {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs text-faint">{label}</span>
            {children}
        </label>
    );
}

const inputClass = "w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 disabled:opacity-50";

export function PolygonClient({ initialTokenSettings, botWallet, gasStatus, usdcStatus, sweepSettings, sweepDestination }: Props) {
    const isAdmin = useIsAdmin();
    const [tokenSettings, setTokenSettings] = useState(initialTokenSettings);
    const [pending, startTransition] = useTransition();
    const [addingAddress, setAddingAddress] = useState<string | null>(null);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [sweepState, setSweepState] = useState(sweepSettings);
    const [showSweepConfirm, setShowSweepConfirm] = useState(false);
    const [sweepRunning, setSweepRunning] = useState(false);
    const [sweepMessage, setSweepMessage] = useState<string | null>(null);

    const notAdded = ALLOWED_TOKENS.filter((t) => !tokenSettings.some((s) => s.tokenAddress.toLowerCase() === t.address.toLowerCase()));

    const handleAdd = (address: string) => {
        setAddingAddress(address);
        startTransition(async () => {
            const result = await addPolygonToken(address, 10, 10);
            setAddingAddress(null);
            if ("error" in result) {
                alert(result.error);
                return;
            }
            window.location.reload();
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Polygon <span className="gradient-text">Reverse-DCA</span>
                    </h1>
                    <p className="text-muted text-sm">
                        La fiecare interval, vinde contravaloarea în USD a GEOD/MYST acumulat din minare și plasează un ordin de răscumpărare când prețul scade.
                    </p>
                </div>
                <Link href="/polygon/stats">
                    <Button variant="secondary" size="sm">
                        <BarChart3 className="w-4 h-4 mr-1.5" /> Statistici
                    </Button>
                </Link>
            </div>

            <Card className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 bg-white/[0.04] border-border text-muted">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-medium text-foreground">Portofel bot (același ca Base/BNB)</h3>
                        {"address" in botWallet ? (
                            <p className="text-xs font-mono text-muted truncate">{botWallet.address}</p>
                        ) : (
                            <p className="text-xs text-red-300">{botWallet.error}</p>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-xs text-faint uppercase tracking-wider mb-1">Sold POL (gas)</p>
                        {"nativeBalance" in gasStatus ? (
                            <p className={cn("font-num", gasStatus.nativeBalance < 0.5 && "text-orange-400")}>
                                {gasStatus.nativeBalance.toFixed(4)} POL
                                {gasStatus.nativeBalance < 0.5 && <span className="ml-1.5 text-xs">(scăzut)</span>}
                            </p>
                        ) : (
                            <p className="text-xs text-red-300">{gasStatus.error}</p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs text-faint uppercase tracking-wider mb-1">Sold USDC</p>
                        {"usdcBalance" in usdcStatus ? (
                            <p className="font-num">{fmtUsd(usdcStatus.usdcBalance)}</p>
                        ) : (
                            <p className="text-xs text-red-300">{usdcStatus.error}</p>
                        )}
                    </div>
                </div>
            </Card>

            {tokenSettings.map((settings) => (
                <TokenCard
                    key={settings.id}
                    settings={settings}
                    isAdmin={isAdmin}
                    pending={pending || runningId === settings.id}
                    onSave={(input) => {
                        startTransition(async () => {
                            const saved = await updatePolygonTokenSettings(settings.id, input);
                            setTokenSettings((prev) => prev.map((s) => (s.id === settings.id ? { ...s, ...JSON.parse(JSON.stringify(saved)) } : s)));
                        });
                    }}
                    onRunNow={() => {
                        setRunningId(settings.id);
                        startTransition(async () => {
                            const result = await runPolygonDcaNow(settings.id);
                            setRunningId(null);
                            if (result.action === "error") alert(`Eroare: ${result.reason}`);
                            else window.location.reload();
                        });
                    }}
                    onCheckNow={() => {
                        setRunningId(settings.id);
                        startTransition(async () => {
                            await reconcilePolygonOrdersNow(settings.id);
                            setRunningId(null);
                            window.location.reload();
                        });
                    }}
                />
            ))}

            {isAdmin && notAdded.length > 0 && (
                <Card className="p-6 space-y-3">
                    <h3 className="text-sm font-medium text-foreground">Adaugă un token</h3>
                    <p className="text-xs text-faint">
                        Doar adresele din lista permisă (ALLOWED_TOKENS) pot fi adăugate — simbolul și zecimalele se citesc direct de pe contract.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {notAdded.map((t) => (
                            <Button key={t.address} variant="outline" size="sm" onClick={() => handleAdd(t.address)} disabled={pending}>
                                {addingAddress === t.address ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
                                Adaugă {t.label}
                            </Button>
                        ))}
                    </div>
                </Card>
            )}

            <Card className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 bg-white/[0.04] border-border text-muted">
                        <Send className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-medium text-foreground">Retragere lunară — profit USDC</h3>
                        <p className="text-xs text-muted">
                            Acoperă tot USDC-ul realizat (nerezervat pentru ordine deschise), din toți bot-ii Polygon combinați.
                        </p>
                    </div>
                </div>

                {"address" in sweepDestination ? (
                    <p className="text-xs text-faint">Către: <span className="font-mono text-muted">{sweepDestination.address}</span></p>
                ) : (
                    <p className="text-xs text-orange-400">{sweepDestination.error} — adaugă-l în Vercel env vars.</p>
                )}

                <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer w-fit">
                    <input
                        type="checkbox"
                        checked={sweepState?.enabled ?? false}
                        disabled={!isAdmin || pending}
                        onChange={(e) => {
                            const enabled = e.target.checked;
                            startTransition(async () => {
                                const saved = await updatePolygonSweepSettings(enabled);
                                setSweepState(JSON.parse(JSON.stringify(saved)));
                            });
                        }}
                        className="accent-primary"
                    />
                    Retragere automată activă
                </label>

                {sweepState?.lastSweepAt && (
                    <p className="text-xs text-faint">
                        Ultima retragere: {new Date(sweepState.lastSweepAt).toLocaleString("ro-RO")} — {sweepState.lastSweepStatus}
                        {sweepState.lastSweepError ? ` (${sweepState.lastSweepError})` : ""}
                    </p>
                )}

                {sweepMessage && <p className="text-xs text-muted">{sweepMessage}</p>}

                {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setShowSweepConfirm(true)} disabled={sweepRunning}>
                        {sweepRunning ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
                        Trimite acum
                    </Button>
                )}
            </Card>

            {showSweepConfirm && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-6">
                    <Card className="max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center gap-2 text-orange-400">
                            <AlertTriangle className="w-5 h-5" />
                            <h3 className="font-medium text-foreground">Confirmă retragerea</h3>
                        </div>
                        <p className="text-sm text-muted">
                            Se trimite tot USDC-ul disponibil (minus ce e rezervat pentru ordinele deschise) către adresa de cold wallet. Continui?
                        </p>
                        <div className="flex gap-3">
                            <Button variant="ghost" className="flex-1" onClick={() => setShowSweepConfirm(false)}>Anulează</Button>
                            <Button
                                variant="primary"
                                className="flex-1"
                                onClick={() => {
                                    setShowSweepConfirm(false);
                                    setSweepRunning(true);
                                    startTransition(async () => {
                                        const result = await runPolygonSweepNow();
                                        setSweepRunning(false);
                                        setSweepMessage(result.action === "sent" ? `Trimis ${result.amountUsdc?.toFixed(2)} USDC.` : (result.reason ?? result.action));
                                    });
                                }}
                            >
                                Trimite
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

function TokenCard({
    settings,
    isAdmin,
    pending,
    onSave,
    onRunNow,
    onCheckNow,
}: {
    settings: TokenSettingsDTO;
    isAdmin: boolean;
    pending: boolean;
    onSave: (input: PolygonTokenSettingsInput) => void;
    onRunNow: () => void;
    onCheckNow: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState<PolygonTokenSettingsInput>({
        enabled: settings.enabled,
        sellAmountUsd: Number(settings.sellAmountUsd),
        intervalHours: settings.intervalHours,
        buybackDipPercent: Number(settings.buybackDipPercent),
        slippageBps: settings.slippageBps,
    });

    return (
        <Card className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0",
                        settings.enabled ? "bg-accent/10 border-accent/20 text-accent" : "bg-white/[0.04] border-border text-muted"
                    )}>
                        <Repeat className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-medium text-foreground">{settings.tokenSymbol}</h3>
                        <p className="text-xs font-mono text-faint">{settings.tokenAddress}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "text-xs font-medium uppercase px-2.5 py-1 rounded-full border",
                        settings.enabled ? "text-accent border-accent/20 bg-accent/5" : "text-muted border-border"
                    )}>
                        {settings.enabled ? "Activ" : "Oprit"}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                    <p className="text-xs text-faint uppercase tracking-wider mb-1">Vândut pe ciclu</p>
                    <p className="font-num">${Number(settings.sellAmountUsd)} / {settings.intervalHours}h</p>
                </div>
                <div>
                    <p className="text-xs text-faint uppercase tracking-wider mb-1">Scădere răscumpărare</p>
                    <p className="font-num">-{Number(settings.buybackDipPercent)}%</p>
                    <p className="text-xs text-faint">
                        din ${Number(settings.sellAmountUsd)}, profit ${(Number(settings.sellAmountUsd) * (Number(settings.buybackDipPercent) / 100)).toFixed(2)}/ciclu
                    </p>
                </div>
                <div>
                    <p className="text-xs text-faint uppercase tracking-wider mb-1">Ultima rulare</p>
                    <p className="text-xs text-muted">
                        {settings.lastRunAt ? new Date(settings.lastRunAt).toLocaleString("ro-RO") : "niciodată"}
                        {settings.lastRunStatus === "error" && <span className="block text-red-300">{settings.lastRunError}</span>}
                    </p>
                </div>
            </div>

            {editing ? (
                <div className="space-y-4 border-t border-border pt-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Sumă vândută pe ciclu (USD)">
                            <input type="number" className={inputClass} value={form.sellAmountUsd} onChange={(e) => setForm({ ...form, sellAmountUsd: Number(e.target.value) })} />
                        </Field>
                        <Field label="Interval (ore)">
                            <input type="number" className={inputClass} value={form.intervalHours} onChange={(e) => setForm({ ...form, intervalHours: Number(e.target.value) })} />
                        </Field>
                        <Field label="Scădere pentru răscumpărare (%)">
                            <input type="number" className={inputClass} value={form.buybackDipPercent} onChange={(e) => setForm({ ...form, buybackDipPercent: Number(e.target.value) })} />
                        </Field>
                        <Field label="Slippage (bps)">
                            <input type="number" className={inputClass} value={form.slippageBps} onChange={(e) => setForm({ ...form, slippageBps: Number(e.target.value) })} />
                        </Field>
                    </div>
                    <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer w-fit">
                        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-primary" />
                        Bot activ
                    </label>
                    <div className="flex gap-3">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                            <X className="w-4 h-4 mr-1.5" /> Anulează
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                                onSave(form);
                                setEditing(false);
                            }}
                        >
                            <Save className="w-4 h-4 mr-1.5" /> Salvează
                        </Button>
                    </div>
                </div>
            ) : (
                isAdmin && (
                    <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                            <Pencil className="w-4 h-4 mr-1.5" /> Editează
                        </Button>
                        <Button variant="outline" size="sm" onClick={onRunNow} disabled={pending}>
                            {pending ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
                            Rulează acum
                        </Button>
                        <Button variant="outline" size="sm" onClick={onCheckNow} disabled={pending}>
                            <ArrowRight className="w-4 h-4 mr-1.5" /> Verifică ordinele
                        </Button>
                    </div>
                )
            )}
        </Card>
    );
}
