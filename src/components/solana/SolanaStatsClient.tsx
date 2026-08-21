"use client";

import React, { useMemo } from "react";
import Link from "next/link";
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
import { ArrowLeft, Coins } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import type { SolanaStats } from "@/app/actions/solana";
import { formatUsd, statusMeta, PENDING_STATUSES, FINAL_STATUSES, type LotDTO } from "./shared";

export function SolanaStatsClient({
    lots,
    stats,
    solPriceUsd,
}: {
    lots: LotDTO[];
    stats: SolanaStats;
    solPriceUsd: number | null;
}) {
    const chartData = useMemo(() => {
        const sorted = [...lots].sort((a, b) => new Date(a.boughtAt).getTime() - new Date(b.boughtAt).getTime());
        const rows: { date: string; buyPrice: number; targetPrice: number | null; invested: number; realized: number }[] = [];
        sorted.reduce(
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
        return rows;
    }, [lots]);

    const pendingLots = lots.filter((l) => PENDING_STATUSES.has(l.status));
    const finalLots = lots.filter((l) => FINAL_STATUSES.has(l.status));

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/solana">
                    <Button variant="ghost" size="icon" aria-label="Înapoi">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                    <Coins className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="font-display text-xl font-medium text-foreground">Solana — Statistici</h1>
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

            {/* Charts */}
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

            {chartData.length === 0 && (
                <Card>
                    <p className="text-sm text-muted">Niciun lot încă — nu sunt suficiente date pentru grafice.</p>
                </Card>
            )}

            {/* Purchases — every lot's buy leg. Always a done, confirmed transaction the
               moment a lot exists (a lot is only created after the swap succeeds), so
               these are distinct from — and always ahead of — the sell side below. */}
            <Card className="overflow-x-auto">
                <h2 className="mb-1 text-sm font-medium text-foreground">Achiziții finalizate ({lots.length})</h2>
                <p className="mb-4 text-xs text-faint">
                    Fiecare cumpărare e o tranzacție deja confirmată pe blockchain — independent de ce se întâmplă cu ordinul de vânzare de mai jos.
                </p>
                <PurchasesTable lots={lots} />
            </Card>

            {/* Sell (trigger) orders — the other half of each lot, tracked separately since
               it can stay pending for a long time (or forever, if price never hits target)
               after the purchase above already completed. */}
            <Card className="overflow-x-auto">
                <h2 className="mb-4 text-sm font-medium text-foreground">Ordine de vânzare — în așteptare ({pendingLots.length})</h2>
                <LotsTable lots={pendingLots} emptyMessage="Niciun ordin de vânzare în așteptare momentan." />
            </Card>

            <Card className="overflow-x-auto">
                <h2 className="mb-4 text-sm font-medium text-foreground">Ordine de vânzare — finalizate ({finalLots.length})</h2>
                <LotsTable lots={finalLots} emptyMessage="Niciun ordin de vânzare finalizat încă." />
            </Card>
        </div>
    );
}

function PurchasesTable({ lots }: { lots: LotDTO[] }) {
    if (lots.length === 0) return <p className="text-sm text-muted">Nicio achiziție încă.</p>;
    const sorted = [...lots].sort((a, b) => new Date(b.boughtAt).getTime() - new Date(a.boughtAt).getTime());
    return (
        <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
                <tr className="text-xs uppercase tracking-wider text-faint">
                    <th className="pb-2 pr-4">Data</th>
                    <th className="pb-2 pr-4">Sumă</th>
                    <th className="pb-2 pr-4">SOL primit</th>
                    <th className="pb-2 pr-4">Preț efectiv</th>
                    <th className="pb-2 pr-4">Fee</th>
                    <th className="pb-2">Tranzacție</th>
                </tr>
            </thead>
            <tbody>
                {sorted.map((lot) => (
                    <tr key={lot.id} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-4 text-muted">{format(new Date(lot.boughtAt), "d MMM, HH:mm")}</td>
                        <td className="py-2 pr-4 text-foreground">{formatUsd(Number(lot.buyAmountUsd))}</td>
                        <td className="py-2 pr-4 text-foreground">{Number(lot.solAcquired).toFixed(4)} SOL</td>
                        <td className="py-2 pr-4 text-foreground">{formatUsd(Number(lot.buyPriceUsd))}</td>
                        <td className="py-2 pr-4 text-faint">{formatUsd(Number(lot.buyFeeUsd))}</td>
                        <td className="py-2 text-faint">
                            {lot.buyTxSignature ? (
                                <a
                                    href={`https://solscan.io/tx/${lot.buyTxSignature}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline decoration-dotted hover:text-foreground"
                                >
                                    {lot.buyTxSignature.slice(0, 6)}...
                                </a>
                            ) : (
                                "—"
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function LotsTable({ lots, emptyMessage }: { lots: LotDTO[]; emptyMessage: string }) {
    if (lots.length === 0) return <p className="text-sm text-muted">{emptyMessage}</p>;
    return (
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
