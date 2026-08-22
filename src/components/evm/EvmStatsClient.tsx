"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
    ComposedChart,
    Line,
    Bar,
    BarChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
} from "recharts";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Coins, Filter, RefreshCw } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import { formatUsd, formatUsdFee, statusMeta, PENDING_STATUSES, FINAL_STATUSES, type LotDTO, type SweepDTO } from "./shared";
import { reconcileEvmOrdersNow } from "@/app/actions/evm";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const PAGE_SIZE = 10;

const STATUS_FILTER_OPTIONS = [
    { value: "PENDING_SELL_ORDER", label: "Ordin în curs" },
    { value: "OPEN", label: "Ordin activ" },
    { value: "FILLED", label: "Vândut" },
    { value: "CANCELLED", label: "Anulat" },
] as const;

export interface FuelStatus {
    usdcBalance: number;
    buyAmountUsd: number;
    intervalHours: number;
    daysRemaining: number;
    projected: { label: string; usdc: number }[];
}

export function EvmStatsClient({
    lots: allLots,
    wethPriceUsd,
    sweeps,
    fuelStatus,
}: {
    lots: LotDTO[];
    stats: unknown; // kept out of use below — everything is recomputed from the (filterable) lot list instead, so the numbers on this page always match what's filtered in.
    wethPriceUsd: number | null;
    sweeps: SweepDTO[];
    fuelStatus: FuelStatus | { error: string };
}) {
    const isAdmin = useIsAdmin();
    const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [checking, setChecking] = useState(false);
    const [checkMessage, setCheckMessage] = useState<string | null>(null);
    const [checkError, setCheckError] = useState<string | null>(null);

    async function handleCheckNow() {
        setChecking(true);
        setCheckMessage(null);
        setCheckError(null);
        try {
            const result = await reconcileEvmOrdersNow();
            const parts = [`${result.checked} verificate`];
            if (result.filled > 0) parts.push(`${result.filled} vândute`);
            if (result.cancelled > 0) parts.push(`${result.cancelled} anulate`);
            setCheckMessage(result.checked === 0 ? "Niciun ordin activ de verificat." : parts.join(", "));
        } catch (err) {
            setCheckError(err instanceof Error ? err.message : "Verificarea a eșuat.");
        } finally {
            setChecking(false);
        }
    }

    const lots = useMemo(() => {
        return allLots.filter((lot) => {
            if (statusFilter.size > 0 && !statusFilter.has(lot.status)) return false;
            const boughtAt = new Date(lot.boughtAt).getTime();
            if (dateFrom && boughtAt < new Date(dateFrom).getTime()) return false;
            if (dateTo && boughtAt > new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
            return true;
        });
    }, [allLots, statusFilter, dateTo, dateFrom]);

    const stats = useMemo(() => {
        let totalInvestedUsd = 0;
        let totalRealizedProceedsUsd = 0;
        let totalRealizedPnlUsd = 0;
        let totalFeesUsd = 0;
        let wethHeld = 0;
        let openOrders = 0;
        for (const lot of lots) {
            if (lot.status === "FAILED") continue;
            totalInvestedUsd += Number(lot.buyAmountUsd);
            totalFeesUsd += Number(lot.buyFeeUsd);
            wethHeld += Number(lot.wethRemaining);
            if (lot.status === "OPEN") openOrders++;
            if (lot.status === "FILLED") {
                totalRealizedProceedsUsd += Number(lot.sellProceedsUsd ?? 0);
                totalRealizedPnlUsd += Number(lot.realizedPnlUsd ?? 0);
                totalFeesUsd += Number(lot.sellFeeUsd ?? 0);
            }
        }
        return { totalInvestedUsd, totalRealizedProceedsUsd, totalRealizedPnlUsd, totalFeesUsd, wethHeld, openOrders };
    }, [lots]);

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

    // Fixed trailing 14-month window, independent of the filter bar above, and
    // counting only finalized cycles (FILLED / CANCELLED / FAILED).
    const monthlyData = useMemo(() => {
        const now = new Date();
        const months: { key: string; label: string }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
        }

        const byMonth = new Map<string, number>();
        for (const lot of allLots) {
            if (!FINAL_STATUSES.has(lot.status)) continue;
            const key = format(new Date(lot.boughtAt), "yyyy-MM");
            byMonth.set(key, (byMonth.get(key) ?? 0) + Number(lot.wethRemaining));
        }

        return months.map(({ key, label }) => ({
            month: label,
            weth: Math.round((byMonth.get(key) ?? 0) * 10000) / 10000,
        }));
    }, [allLots]);

    // How long each finalized sell order actually took to fill, grouped by
    // its take-profit percent. Duration measured from when the limit order
    // was placed (sellOrderCreatedAt) to the moment we detected the fill
    // (soldAt) — the 1inch Orderbook API doesn't report the actual fill
    // timestamp, so soldAt is "first time we noticed" rather than the true
    // fill time, unlike the Solana version where Jupiter reports it exactly.
    const durationByPercentData = useMemo(() => {
        const groups = new Map<string, { totalHours: number; count: number; percent: number }>();
        for (const lot of allLots) {
            if (lot.status !== "FILLED" || !lot.soldAt) continue;
            const buyPrice = Number(lot.buyPriceUsd);
            const targetPrice = lot.targetPriceUsd ? Number(lot.targetPriceUsd) : null;
            if (!targetPrice || buyPrice <= 0) continue;

            const start = new Date(lot.sellOrderCreatedAt ?? lot.boughtAt).getTime();
            const end = new Date(lot.soldAt).getTime();
            const hours = (end - start) / (1000 * 60 * 60);
            if (!Number.isFinite(hours) || hours < 0) continue;

            const percent = Math.round((targetPrice / buyPrice - 1) * 1000) / 10; // one decimal, e.g. 5.0
            const key = `${percent}%`;
            const existing = groups.get(key) ?? { totalHours: 0, count: 0, percent };
            existing.totalHours += hours;
            existing.count += 1;
            groups.set(key, existing);
        }
        return [...groups.entries()]
            .sort(([, a], [, b]) => a.percent - b.percent)
            .map(([label, g]) => ({
                percent: label,
                avgHours: Math.round((g.totalHours / g.count) * 10) / 10,
                count: g.count,
            }));
    }, [allLots]);

    // Same fixed trailing 14-month window as monthlyData above, but for
    // WETH actually sent out to the sweep destination — only SUCCESS rows count.
    const monthlySweepData = useMemo(() => {
        const now = new Date();
        const months: { key: string; label: string }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
        }

        const byMonth = new Map<string, number>();
        for (const sweep of sweeps) {
            if (sweep.status !== "SUCCESS") continue;
            const key = format(new Date(sweep.createdAt), "yyyy-MM");
            byMonth.set(key, (byMonth.get(key) ?? 0) + Number(sweep.amountWeth));
        }

        return months.map(({ key, label }) => ({
            month: label,
            weth: Math.round((byMonth.get(key) ?? 0) * 10000) / 10000,
        }));
    }, [sweeps]);

    const pendingLots = lots.filter((l) => PENDING_STATUSES.has(l.status));
    const finalLots = lots.filter((l) => FINAL_STATUSES.has(l.status));

    function toggleStatus(value: string) {
        setStatusFilter((prev) => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/base">
                    <Button variant="ghost" size="icon" aria-label="Înapoi">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                    <Coins className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="font-display text-xl font-medium text-foreground">Base (ETH) — Statistici</h1>
                    <p className="text-sm text-muted">
                        {wethPriceUsd ? `Preț curent: ${formatUsd(wethPriceUsd)}` : "Preț curent indisponibil momentan"}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <Card className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Filter className="h-4 w-4" /> Filtre
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {STATUS_FILTER_OPTIONS.map((opt) => {
                        const active = statusFilter.has(opt.value);
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleStatus(opt.value)}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs transition-colors",
                                    active
                                        ? "border-primary/50 bg-primary/15 text-primary"
                                        : "border-white/10 bg-white/[0.03] text-faint hover:text-muted"
                                )}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                    {statusFilter.size > 0 && (
                        <button type="button" onClick={() => setStatusFilter(new Set())} className="text-xs text-faint underline decoration-dotted hover:text-muted">
                            Șterge filtrul de status
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="block space-y-1.5">
                        <span className="text-xs text-faint">De la data</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="text-xs text-faint">Până la data</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                    </label>
                    {(dateFrom || dateTo) && (
                        <button
                            type="button"
                            onClick={() => {
                                setDateFrom("");
                                setDateTo("");
                            }}
                            className="pb-2.5 text-xs text-faint underline decoration-dotted hover:text-muted"
                        >
                            Șterge intervalul de date
                        </button>
                    )}
                </div>
                {(statusFilter.size > 0 || dateFrom || dateTo) && (
                    <p className="text-xs text-faint">
                        {lots.length} din {allLots.length} loturi corespund filtrelor — toate cardurile, graficele și tabelele de mai jos reflectă doar selecția curentă.
                    </p>
                )}
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Investit total" value={formatUsd(stats.totalInvestedUsd)} />
                <StatCard label="Încasat (vândut)" value={formatUsd(stats.totalRealizedProceedsUsd)} />
                <StatCard
                    label="P&L realizat"
                    value={formatUsd(stats.totalRealizedPnlUsd)}
                    positive={stats.totalRealizedPnlUsd >= 0}
                />
                <StatCard label="Fee-uri totale" value={formatUsdFee(stats.totalFeesUsd)} />
                <StatCard label="WETH deținut" value={`${stats.wethHeld.toFixed(5)} WETH`} />
                <StatCard label="Ordine active" value={String(stats.openOrders)} />
            </div>

            {/* Fuel — how many more buy cycles the current USDC balance can fund */}
            <Card>
                <h2 className="mb-1 text-sm font-medium text-foreground">Combustibil (USDC)</h2>
                {"error" in fuelStatus ? (
                    <p className="text-sm text-muted">{fuelStatus.error}</p>
                ) : fuelStatus.usdcBalance <= 0 ? (
                    <p className="text-sm text-muted">
                        Portofelul botului are 0 USDC — alimentează-l ca DCA-ul să poată continua.
                    </p>
                ) : (
                    <>
                        <p className="mb-4 text-xs text-faint">
                            {formatUsd(fuelStatus.usdcBalance)} USDC în portofel ÷ {formatUsd(fuelStatus.buyAmountUsd)} pe ciclu, la fiecare {fuelStatus.intervalHours}h ≈{" "}
                            <span className="font-medium text-foreground">{Math.floor(fuelStatus.daysRemaining)} zile</span> de cumpărări rămase la ritmul curent.
                        </p>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={fuelStatus.projected}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                                <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                                <Tooltip
                                    contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                    formatter={(v) => formatUsd(Number(v))}
                                />
                                <Bar dataKey="usdc" name="USDC proiectat" fill="rgba(96,165,250,0.7)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </>
                )}
            </Card>

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
                            {wethPriceUsd && (
                                <ReferenceLine
                                    y={wethPriceUsd}
                                    stroke="#e5e7eb"
                                    strokeDasharray="2 3"
                                    label={{ value: `Preț curent: ${formatUsd(wethPriceUsd)}`, position: "insideTopRight", fill: "#e5e7eb", fontSize: 11 }}
                                />
                            )}
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

            {monthlyData.length > 0 && (
                <Card>
                    <h2 className="mb-1 text-sm font-medium text-foreground">WETH acumulat pe lună</h2>
                    <p className="mb-4 text-xs text-faint">
                        Ultimele 14 luni, doar cicluri finalizate — WETH rămas efectiv în portofel după vânzare (profitul), nu suma cumpărată. Loturile în așteptare nu sunt incluse încă.
                    </p>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => `${Number(v).toFixed(5)} WETH`}
                            />
                            <Bar dataKey="weth" name="WETH cumpărat" fill="rgba(98,126,234,0.7)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            )}

            <Card>
                <h2 className="mb-1 text-sm font-medium text-foreground">Timp mediu până la execuție, pe procent țintă</h2>
                <p className="mb-4 text-xs text-faint">
                    Doar cicluri finalizate cu vânzare — de la plasarea ordinului limită până la execuție. Ajută să vezi ce procent țintă se execută cel mai repede din istoric (numărul de cicluri per bară contează — o medie din 1-2 cicluri nu e încă relevantă).
                </p>
                {durationByPercentData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={durationByPercentData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="percent" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" label={{ value: "ore", angle: -90, position: "insideLeft", fontSize: 11, fill: "rgba(255,255,255,0.3)" }} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(value, name, item) => {
                                    const count = (item?.payload as { count?: number } | undefined)?.count ?? 0;
                                    return [`${Number(value).toFixed(1)} ore (n=${count})`, "Timp mediu"];
                                }}
                            />
                            <Bar dataKey="avgHours" name="Timp mediu" fill="rgba(45,212,191,0.6)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="text-sm text-muted">
                        Niciun ciclu finalizat încă — graficul se populează automat de îndată ce primul ordin de vânzare se execută.
                    </p>
                )}
            </Card>

            <Card>
                <h2 className="mb-1 text-sm font-medium text-foreground">Trimiteri lunare către portofelul de retragere</h2>
                <p className="mb-4 text-xs text-faint">
                    Ultimele 14 luni, doar retrageri reușite — WETH trimis efectiv peste minimul păstrat în portofelul botului.
                </p>
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthlySweepData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <Tooltip
                            contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                            formatter={(v) => `${Number(v).toFixed(5)} WETH`}
                        />
                        <Bar dataKey="weth" name="WETH retras" fill="rgba(96,165,250,0.7)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            {chartData.length === 0 && (
                <Card>
                    <p className="text-sm text-muted">Niciun lot corespunde filtrelor curente — nu sunt suficiente date pentru grafice.</p>
                </Card>
            )}

            <Card className="overflow-x-auto">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-foreground">Cicluri DCA ({lots.length})</h2>
                    <div className="flex items-center gap-3">
                        {checkMessage && <span className="text-xs text-emerald-300">{checkMessage}</span>}
                        {checkError && <span className="text-xs text-red-300">{checkError}</span>}
                        {isAdmin && (
                            <Button variant="outline" size="sm" onClick={handleCheckNow} disabled={checking}>
                                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", checking && "animate-spin")} />
                                {checking ? "Se verifică..." : "Verifică acum"}
                            </Button>
                        )}
                    </div>
                </div>
                <p className="mb-4 text-xs text-faint">
                    Fiecare rând e un ciclu complet — cumpărare (mereu confirmată pe blockchain) și, alături, statusul vânzării ({pendingLots.length} în așteptare, {finalLots.length} finalizate).
                </p>
                <CyclesTable lots={lots} />
            </Card>

            <Card className="overflow-x-auto">
                <h2 className="mb-1 text-sm font-medium text-foreground">Retrageri lunare — istoric ({sweeps.length})</h2>
                <p className="mb-4 text-xs text-faint">Fiecare încercare de retragere automată sau manuală, reușită sau nu.</p>
                <SweepsTable sweeps={sweeps} />
            </Card>
        </div>
    );
}



function Pager({
    page,
    setPage,
    totalItems,
    pageStart,
}: {
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    totalItems: number;
    pageStart: number;
}) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (totalItems <= PAGE_SIZE) return null;
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className="text-xs text-faint">
                Afișare {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, totalItems)} din {totalItems}
            </p>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Anterior
                </Button>
                <span className="px-2 text-xs text-faint">
                    Pagina {page} din {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Următor
                </Button>
            </div>
        </div>
    );
}

function BasescanLink({ hash, label }: { hash: string; label: string }) {
    return (
        <a
            href={`https://basescan.org/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted hover:text-foreground"
        >
            {label}
        </a>
    );
}

function CyclesTable({ lots }: { lots: LotDTO[] }) {
    const [page, setPage] = useState(1);
    if (lots.length === 0) return <p className="text-sm text-muted">Niciun ciclu încă.</p>;
    const sorted = [...lots].sort((a, b) => new Date(b.boughtAt).getTime() - new Date(a.boughtAt).getTime());
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageStart = (Math.min(page, totalPages) - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);
    return (
        <>
            <table className="w-full min-w-[1180px] text-left text-sm">
                <thead>
                    <tr className="text-xs uppercase tracking-wider text-faint">
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Sumă</th>
                        <th className="pb-2 pr-4">WETH primit</th>
                        <th className="pb-2 pr-4">Preț cumpărare</th>
                        <th className="pb-2 pr-4">Fee</th>
                        <th className="pb-2 pr-4">Preț țintă</th>
                        <th className="pb-2 pr-4">Vândut</th>
                        <th className="pb-2 pr-4">P&L</th>
                        <th className="pb-2 pr-4">WETH rămas</th>
                        <th className="pb-2 pr-4">Verificat</th>
                        <th className="pb-2 pr-4">Cumpărare</th>
                        <th className="pb-2">Ordin 1inch</th>
                    </tr>
                </thead>
                <tbody>
                    {pageItems.map((lot) => {
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
                                <td className="py-2 pr-4 text-foreground">{Number(lot.wethAcquired).toFixed(5)}</td>
                                <td className="py-2 pr-4 text-foreground">{formatUsd(Number(lot.buyPriceUsd))}</td>
                                <td className="py-2 pr-4 text-faint">{formatUsdFee(Number(lot.buyFeeUsd))}</td>
                                <td className="py-2 pr-4 text-foreground">{lot.targetPriceUsd ? formatUsd(Number(lot.targetPriceUsd)) : "—"}</td>
                                <td className="py-2 pr-4 text-foreground">{lot.sellProceedsUsd ? formatUsd(Number(lot.sellProceedsUsd)) : "—"}</td>
                                <td className={cn("py-2 pr-4", lot.realizedPnlUsd && Number(lot.realizedPnlUsd) < 0 ? "text-red-300" : "text-emerald-300")}>
                                    {lot.realizedPnlUsd ? formatUsd(Number(lot.realizedPnlUsd)) : "—"}
                                </td>
                                <td className="py-2 pr-4 text-foreground">{Number(lot.wethRemaining).toFixed(5)}</td>
                                <td className="py-2 pr-4 text-faint" title={lot.lastCheckedAt ? new Date(lot.lastCheckedAt).toLocaleString("ro-RO") : undefined}>
                                    {lot.lastCheckedAt
                                        ? formatDistanceToNow(new Date(lot.lastCheckedAt), { addSuffix: true })
                                        : "încă neverificat"}
                                </td>
                                <td className="py-2 pr-4 text-faint">
                                    {lot.buyTxHash ? <BasescanLink hash={lot.buyTxHash} label="Vezi ↗" /> : "—"}
                                </td>
                                <td className="py-2 text-faint">
                                    {/* 1inch is a gasless off-chain orderbook — there's no creation/fill
                                        transaction to link to, unlike Jupiter's on-chain trigger orders.
                                        The order hash is shown instead, for cross-referencing. */}
                                    {lot.oneInchOrderHash ? (
                                        <code className="text-xs">{lot.oneInchOrderHash.slice(0, 10)}…</code>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <Pager page={Math.min(page, totalPages)} setPage={setPage} totalItems={sorted.length} pageStart={pageStart} />
        </>
    );
}

function SweepsTable({ sweeps }: { sweeps: SweepDTO[] }) {
    const [page, setPage] = useState(1);
    if (sweeps.length === 0) return <p className="text-sm text-muted">Nicio retragere încă.</p>;
    const totalPages = Math.max(1, Math.ceil(sweeps.length / PAGE_SIZE));
    const pageStart = (Math.min(page, totalPages) - 1) * PAGE_SIZE;
    const pageItems = sweeps.slice(pageStart, pageStart + PAGE_SIZE);
    return (
        <>
            <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                    <tr className="text-xs uppercase tracking-wider text-faint">
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Balanță înainte</th>
                        <th className="pb-2 pr-4">Sumă trimisă</th>
                        <th className="pb-2 pr-4">Sursă</th>
                        <th className="pb-2 pr-4">Eroare</th>
                        <th className="pb-2">Tranzacție</th>
                    </tr>
                </thead>
                <tbody>
                    {pageItems.map((sweep) => (
                        <tr key={sweep.id} className="border-t border-white/[0.06]">
                            <td className="py-2 pr-4 text-muted">{format(new Date(sweep.createdAt), "d MMM, HH:mm")}</td>
                            <td className="py-2 pr-4">
                                <span
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                                        sweep.status === "SUCCESS"
                                            ? "text-emerald-300 bg-emerald-500/10 border-emerald-400/30"
                                            : "text-red-300 bg-red-500/10 border-red-400/30"
                                    )}
                                >
                                    {sweep.status === "SUCCESS" ? "Trimis" : "Eșuat"}
                                </span>
                            </td>
                            <td className="py-2 pr-4 text-foreground">{Number(sweep.balanceBeforeWeth).toFixed(5)} WETH</td>
                            <td className="py-2 pr-4 text-foreground">{Number(sweep.amountWeth).toFixed(5)} WETH</td>
                            <td className="py-2 pr-4 text-faint">{sweep.manual ? "manual" : "automat"}</td>
                            <td className="py-2 pr-4 text-red-300">{sweep.errorMessage ?? "—"}</td>
                            <td className="py-2 text-faint">
                                {sweep.txHash ? <BasescanLink hash={sweep.txHash} label="Vezi ↗" /> : "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Pager page={Math.min(page, totalPages)} setPage={setPage} totalItems={sweeps.length} pageStart={pageStart} />
        </>
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
