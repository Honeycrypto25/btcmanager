"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { Coins, Play, Save, Clock, CheckCircle2, XCircle, AlertTriangle, Wallet } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import { upsertSolanaSettings, runSolanaDcaNow, type SolanaSettingsInput, type SolanaStats } from "@/app/actions/solana";

// Prisma Decimal/DateTime fields arrive from the server as strings after the JSON round-trip.
interface LotDTO {
    id: string;
    status: string;
    buyAmountUsd: string;
    solAcquired: string;
    buyPriceUsd: string;
    buyFeeUsd: string;
    buyTxSignature: string | null;
    boughtAt: string;
    targetPriceUsd: string | null;
    sellAmountSolPlanned: string | null;
    jupiterOrderKey: string | null;
    soldAt: string | null;
    solSold: string | null;
    sellProceedsUsd: string | null;
    realizedPnlUsd: string | null;
    solRemaining: string;
    notes: string | null;
}

interface SettingsDTO {
    id: string;
    enabled: boolean;
    walletAddress: string;
    buyAmountUsd: string;
    intervalHours: number;
    takeProfitPercent: string;
    sellAmountUsd: string;
    slippageBps: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunError: string | null;
}

function formatUsd(n: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

const statusMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
    PENDING_SELL_ORDER: { label: "Ordin în curs", icon: Clock, className: "text-amber-300 bg-amber-500/10 border-amber-400/30" },
    OPEN: { label: "Ordin activ", icon: Clock, className: "text-primary bg-primary/10 border-primary/30" },
    FILLED: { label: "Vândut", icon: CheckCircle2, className: "text-emerald-300 bg-emerald-500/10 border-emerald-400/30" },
    CANCELLED: { label: "Anulat", icon: XCircle, className: "text-muted bg-white/[0.04] border-white/10" },
    FAILED: { label: "Eșuat", icon: AlertTriangle, className: "text-red-300 bg-red-500/10 border-red-400/30" },
};

export function SolanaClient({
    initialSettings,
    initialLots,
    initialStats,
    solPriceUsd,
    botWallet,
}: {
    initialSettings: SettingsDTO | null;
    initialLots: LotDTO[];
    initialStats: SolanaStats;
    solPriceUsd: number | null;
    botWallet: { address: string } | { error: string };
}) {
    const [settings, setSettings] = useState<SettingsDTO | null>(initialSettings);
    const [form, setForm] = useState<SolanaSettingsInput>({
        enabled: initialSettings?.enabled ?? false,
        buyAmountUsd: initialSettings ? Number(initialSettings.buyAmountUsd) : 10,
        intervalHours: initialSettings?.intervalHours ?? 24,
        takeProfitPercent: initialSettings ? Number(initialSettings.takeProfitPercent) : 10,
        sellAmountUsd: initialSettings ? Number(initialSettings.sellAmountUsd) : 10,
        slippageBps: initialSettings?.slippageBps ?? 50,
    });
    const [saving, startSaving] = useTransition();
    const [running, startRunning] = useTransition();
    const [runMessage, setRunMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const lots = initialLots;
    const stats = initialStats;

    const chartData = useMemo(() => {
        const sorted = [...lots].sort((a, b) => new Date(a.boughtAt).getTime() - new Date(b.boughtAt).getTime());
        const rows: { date: string; buyPrice: number; targetPrice: number | null; invested: number; realized: number }[] = [];
        const totals = sorted.reduce(
            (acc, lot) => {
                const invested = acc.invested + Number(lot.buyAmountUsd);
                const realized = acc.realized + (lot.status === "FILLED" ? Number(lot.sellProceedsUsd ?? 0) : 0);
                rows.push({
                    date: format(new Date(lot.boughtAt), "d MMM"),
                    buyPrice: Number(lot.buyPriceUsd),
                    targetPrice: lot.targetPriceUsd ? Number(lot.targetPriceUsd) : null,
                    invested: Math.round(invested * 100) / 100,
                    realized: Math.round(realized * 100) / 100,
                });
                return { invested, realized };
            },
            { invested: 0, realized: 0 }
        );
        void totals;
        return rows;
    }, [lots]);

    function handleSave() {
        setError(null);
        startSaving(async () => {
            try {
                const saved = await upsertSolanaSettings(form);
                setSettings(JSON.parse(JSON.stringify(saved)));
            } catch (e) {
                setError(e instanceof Error ? e.message : "Eroare la salvare.");
            }
        });
    }

    function handleRunNow() {
        setRunMessage(null);
        setError(null);
        startRunning(async () => {
            try {
                const result = await runSolanaDcaNow();
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
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                    <Coins className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="font-display text-xl font-medium text-foreground">Solana — DCA automat</h1>
                    <p className="text-sm text-muted">
                        {solPriceUsd ? `Preț curent: ${formatUsd(solPriceUsd)}` : "Preț curent indisponibil momentan"}
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Investit total" value={formatUsd(stats.totalInvestedUsd)} />
                <StatCard label="Încasat (vândut)" value={formatUsd(stats.totalRealizedProceedsUsd)} />
                <StatCard
                    label="P&L realizat"
                    value={formatUsd(stats.totalRealizedPnlUsd)}
                    positive={stats.totalRealizedPnlUsd >= 0}
                />
                <StatCard label="Fee-uri totale" value={formatUsd(stats.totalFeesUsd)} />
                <StatCard label="SOL deținut" value={`${stats.solHeld.toFixed(4)} SOL`} />
                <StatCard label="Ordine active" value={String(stats.openOrders)} />
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">Preț de achiziție vs. țintă de vânzare, per lot</h2>
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" domain={["auto", "auto"]} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => formatUsd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="buyPrice" name="Preț achiziție" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="targetPrice" name="Preț țintă" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Card>
            )}

            {chartData.length > 0 && (
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">Investit vs. încasat (cumulativ)</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => formatUsd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="invested" name="Investit cumulativ" fill="rgba(139,92,246,0.5)" />
                            <Bar dataKey="realized" name="Încasat cumulativ" fill="rgba(34,197,94,0.5)" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Card>
            )}

            {/* Settings */}
            <Card className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-foreground">Setări</h2>
                    <label className="flex items-center gap-2 text-sm text-muted">
                        <input
                            type="checkbox"
                            checked={form.enabled}
                            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                            className="h-4 w-4 rounded border-white/20 bg-transparent"
                        />
                        Activ
                    </label>
                </div>

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
                        <span className="text-faint">Portofel (derivat din cheia din Vercel):</span>
                        <code className="text-foreground">{botWallet.address}</code>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Sumă cumpărare per ciclu ($)">
                        <input
                            type="number"
                            step="0.01"
                            value={form.buyAmountUsd}
                            onChange={(e) => setForm({ ...form, buyAmountUsd: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                    </Field>
                    <Field label="Interval (ore)">
                        <input
                            type="number"
                            value={form.intervalHours}
                            onChange={(e) => setForm({ ...form, intervalHours: parseInt(e.target.value) || 1 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                    </Field>
                    <Field label="Țintă de creștere pentru vânzare (%)">
                        <input
                            type="number"
                            step="0.1"
                            value={form.takeProfitPercent}
                            onChange={(e) => setForm({ ...form, takeProfitPercent: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                    </Field>
                    <Field label="Sumă de vânzare la țintă ($)">
                        <input
                            type="number"
                            step="0.01"
                            value={form.sellAmountUsd}
                            onChange={(e) => setForm({ ...form, sellAmountUsd: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                    </Field>
                    <Field label="Slippage la cumpărare (bps, 50 = 0.5%)">
                        <input
                            type="number"
                            value={form.slippageBps}
                            onChange={(e) => setForm({ ...form, slippageBps: parseInt(e.target.value) || 50 })}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                    </Field>
                </div>

                {error && <p className="text-sm text-red-300">{error}</p>}
                {runMessage && <p className="text-sm text-muted">{runMessage}</p>}

                {settings?.lastRunAt && (
                    <p className="text-xs text-faint">
                        Ultima rulare: {format(new Date(settings.lastRunAt), "d MMM yyyy, HH:mm")} — {settings.lastRunStatus}
                        {settings.lastRunError ? ` (${settings.lastRunError})` : ""}
                    </p>
                )}

                <div className="flex flex-wrap gap-3">
                    <Button onClick={handleSave} disabled={saving || "error" in botWallet} variant="primary">
                        <Save className="h-4 w-4" /> {saving ? "Se salvează..." : "Salvează setările"}
                    </Button>
                    <Button onClick={handleRunNow} disabled={running || !settings} variant="secondary">
                        <Play className="h-4 w-4" /> {running ? "Se rulează..." : "Rulează acum (test)"}
                    </Button>
                </div>
                <p className="text-xs text-faint">
                    Portofelul trebuie să aibă în prealabil USDC (pentru cumpărare) și puțin SOL (pentru fee-uri de rețea).
                    Cheia privată se citește din variabila de mediu <code>SOLANA_PRIVATE_KEY</code> din Vercel — nu e stocată în baza de date.
                </p>
            </Card>

            {/* Lots table */}
            <Card className="overflow-x-auto">
                <h2 className="mb-4 text-sm font-medium text-foreground">Istoric loturi</h2>
                {lots.length === 0 ? (
                    <p className="text-sm text-muted">Niciun lot încă — activează setările de mai sus și rulează primul ciclu.</p>
                ) : (
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="text-xs uppercase tracking-wider text-faint">
                                <th className="pb-2 pr-4">Data</th>
                                <th className="pb-2 pr-4">Status</th>
                                <th className="pb-2 pr-4">Cumpărat</th>
                                <th className="pb-2 pr-4">Preț cumpărare</th>
                                <th className="pb-2 pr-4">Preț țintă</th>
                                <th className="pb-2 pr-4">Vândut</th>
                                <th className="pb-2 pr-4">P&L</th>
                                <th className="pb-2">SOL rămas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lots.map((lot) => {
                                const meta = statusMeta[lot.status] ?? statusMeta.PENDING_SELL_ORDER;
                                const Icon = meta.icon;
                                return (
                                    <tr key={lot.id} className="border-t border-white/[0.06]">
                                        <td className="py-2 pr-4 text-muted">{format(new Date(lot.boughtAt), "d MMM, HH:mm")}</td>
                                        <td className="py-2 pr-4">
                                            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", meta.className)}>
                                                <Icon className="h-3 w-3" /> {meta.label}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-4 text-foreground">{formatUsd(Number(lot.buyAmountUsd))}</td>
                                        <td className="py-2 pr-4 text-foreground">{formatUsd(Number(lot.buyPriceUsd))}</td>
                                        <td className="py-2 pr-4 text-foreground">{lot.targetPriceUsd ? formatUsd(Number(lot.targetPriceUsd)) : "—"}</td>
                                        <td className="py-2 pr-4 text-foreground">{lot.sellProceedsUsd ? formatUsd(Number(lot.sellProceedsUsd)) : "—"}</td>
                                        <td className={cn("py-2 pr-4", lot.realizedPnlUsd && Number(lot.realizedPnlUsd) < 0 ? "text-red-300" : "text-emerald-300")}>
                                            {lot.realizedPnlUsd ? formatUsd(Number(lot.realizedPnlUsd)) : "—"}
                                        </td>
                                        <td className="py-2 text-foreground">{Number(lot.solRemaining).toFixed(4)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </Card>
        </div>
    );
}

function StatCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
    return (
        <Card className="p-4">
            <p className="text-xs text-faint">{label}</p>
            <p className={cn("mt-1 font-display text-lg font-medium", positive === undefined ? "text-foreground" : positive ? "text-emerald-300" : "text-red-300")}>
                {value}
            </p>
        </Card>
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
