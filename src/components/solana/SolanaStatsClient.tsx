"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { FuelBars } from "./FuelBars";
import {
ComposedChart,Bar,
BarChart,
XAxis,
YAxis,
CartesianGrid,
Tooltip,
Legend,ResponsiveContainer,
LabelList
} from "recharts";
import { ChartGradients, cg, LABEL_STYLE } from "@/components/ui/chart-gradients";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Coins, Filter, RefreshCw } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";
import { PriceRangeCard } from "@/components/ui/PriceRangeCard";
import { SortTh, useSort } from "@/components/ui/SortableTh";
import { LotPriceChart } from "@/components/ui/LotPriceChart";
import { BotUptimeCard, type BotUptimeDTO } from "@/components/ui/BotUptimeCard";
import { fmtLotDate, fmtLotDays, lotTiming } from "@/lib/lot-timing";
import { ProfitHeatmap, type HeatLot } from "@/components/ui/ProfitHeatmap";
import type { SolanaLimitBuyDTO } from "./SolanaLimitBuyCard";
import { formatUsd, formatUsdFee, statusMeta, PENDING_STATUSES, FINAL_STATUSES, type LotDTO, type SweepDTO } from "./shared";
import { reconcileSolanaOrdersNow } from "@/app/actions/solana";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { LotStatusFilter, useLotStatusFilter } from "@/components/ui/LotStatusFilter";
import { MonthlyOrdersChart } from "@/components/ui/MonthlyOrdersChart";
import { Last30Stats } from "@/components/ui/Last30Stats";
import { BuyTimingCard } from "./BuyTimingCard";
import { AmountAdviceCard } from "@/components/ui/AmountAdviceCard";
import { NearestOrdersCards } from "@/components/ui/NearestOrdersCards";
import { Compare30Card, split30 } from "@/components/ui/Compare30Card";
import type { PriceHistory } from "@/lib/price-history";

const STATUS_LABEL_MAP: Record<string, string> = Object.fromEntries(Object.entries(statusMeta).map(([k, v]) => [k, v.label]));

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
    periodHours: number;
    buysLeft: number;
    projected: { label: string; usdc: number }[];
}

export function SolanaStatsClient({
    lots: allLots,
    solPriceUsd,
    sweeps,
    fuelStatus,
    limitBuys = [],
    uptime,
    daily = null,
    limitLots = {},
}: {
    lots: LotDTO[];
    stats: unknown; // kept out of use below — everything is recomputed from the (filterable) lot list instead, so the numbers on this page always match what's filtered in.
    solPriceUsd: number | null;
    sweeps: SweepDTO[];
    fuelStatus: FuelStatus | { error: string };
    limitBuys?: SolanaLimitBuyDTO[];
    uptime?: BotUptimeDTO;
    daily?: PriceHistory | { error: string } | null;
    limitLots?: Record<string, boolean>; // lot id → bought by a limit order (true = automatic dip)
}) {
    const [nowMs] = useState(() => Date.now()); // fixed at mount — keeps render pure
    const isAdmin = useIsAdmin();
    const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
    // Monthly withdrawals: which destination is shown in the chart and the history table (all / cold wallet / loan).
    const [sweepView, setSweepView] = useState<"all" | "cold" | "lend">("all");
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
            const result = await reconcileSolanaOrdersNow();
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
        let solHeld = 0;
        let openOrders = 0;
        for (const lot of lots) {
            if (lot.status === "FAILED") continue;
            totalInvestedUsd += Number(lot.buyAmountUsd);
            totalFeesUsd += Number(lot.buyFeeUsd);
            solHeld += Number(lot.solRemaining);
            if (lot.status === "OPEN") openOrders++;
            if (lot.status === "FILLED") {
                totalRealizedProceedsUsd += Number(lot.sellProceedsUsd ?? 0);
                totalRealizedPnlUsd += Number(lot.realizedPnlUsd ?? 0);
                totalFeesUsd += Number(lot.sellFeeUsd ?? 0);
            }
        }
        return { totalInvestedUsd, totalRealizedProceedsUsd, totalRealizedPnlUsd, totalFeesUsd, solHeld, openOrders };
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

    // Just the currently-active limit sell orders — deliberately NOT built
    // from the (filterable/date-ranged) `lots` above, and deliberately not
    // accumulating history: this chart exists to answer "what am I exposed
    // to right now", so a lot drops off the moment it's filled or
    // cancelled rather than lingering as a flat historical line.
    const openLotsChartData = useMemo(() => {
        return allLots
            .filter((lot) => lot.status === "OPEN")
            .sort((a, b) => new Date(a.boughtAt).getTime() - new Date(b.boughtAt).getTime())
            .map((lot) => ({
                date: format(new Date(lot.boughtAt), "d MMM"),
                buyPrice: Number(lot.buyPriceUsd),
                targetPrice: lot.targetPriceUsd ? Number(lot.targetPriceUsd) : null,
            }));
    }, [allLots]);

    const openLimitBuys = useMemo(() => limitBuys.filter((o) => o.status === "OPEN"), [limitBuys]);

    // Open sell targets for the profit heatmap: profit taken when each order fills = planned slice × (target − buy).
    const heatLots = useMemo<HeatLot[]>(() => {
        const out: HeatLot[] = [];
        for (const lot of allLots) {
            if (lot.status !== "OPEN" || !lot.targetPriceUsd) continue;
            const buy = Number(lot.buyPriceUsd);
            const target = Number(lot.targetPriceUsd);
            const qty = Number(lot.sellAmountSolPlanned ?? lot.solRemaining);
            const profit = qty * (target - buy);
            if (!(buy > 0) || !(target > 0) || !Number.isFinite(profit)) continue;
            out.push({ t: new Date(lot.boughtAt).getTime(), buyPrice: buy, targetPrice: target, profitUsd: profit });
        }
        return out;
    }, [allLots]);

    // Fixed trailing 14-month window, independent of the filter bar above, and
    // counting only finalized cycles (FILLED / CANCELLED / FAILED) — a pending
    // lot's sell hasn't happened yet, so how much SOL ultimately stays
    // "accumulated" vs. gets sold for profit isn't known until it resolves.
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
            byMonth.set(key, (byMonth.get(key) ?? 0) + Number(lot.solRemaining));
        }

        return months.map(({ key, label }) => ({
            month: label,
            sol: Math.round((byMonth.get(key) ?? 0) * 10000) / 10000,
        }));
    }, [allLots]);

    // How long each finalized sell order actually took to fill, grouped by its
    // take-profit percent (reconstructed per-lot from targetPriceUsd/buyPriceUsd
    // rather than read from current settings, since that % can change over time
    // while old lots keep whatever target they were created with). Duration is
    // measured from when the limit order was placed (sellOrderCreatedAt) to when
    // it filled (soldAt) — cancelled/still-pending lots have no fill time and are
    // excluded. Meant to answer "which target % actually executes fastest?"
    // rather than sitting unfilled for a long time.
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
    // SOL actually sent out to the sweep destination — only SUCCESS rows
    // count (a FAILED attempt moved nothing).
    const monthlySweepData = useMemo(() => {
        const now = new Date();
        const months: { key: string; label: string }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
        }

        // Cold wallet = SOL transferred out; loan = SOL deposited as collateral into the Jupiter Lend position.
        const cold = new Map<string, number>();
        const loan = new Map<string, number>();
        for (const sweep of sweeps) {
            if (sweep.status !== "SUCCESS") continue;
            const key = format(new Date(sweep.createdAt), "yyyy-MM");
            const bucket = sweep.target === "lend" ? loan : cold;
            bucket.set(key, (bucket.get(key) ?? 0) + Number(sweep.amountSol));
        }

        const r4 = (v: number) => Math.round(v * 10000) / 10000;
        return months.map(({ key, label }) => ({
            month: label,
            cold: r4(cold.get(key) ?? 0),
            loan: r4(loan.get(key) ?? 0),
        }));
    }, [sweeps]);

    const sweepTotals = useMemo(() => {
        let cold = 0;
        let loan = 0;
        let nCold = 0;
        let nLoan = 0;
        for (const sw of sweeps) {
            if (sw.status !== "SUCCESS") continue;
            if (sw.target === "lend") {
                loan += Number(sw.amountSol);
                nLoan++;
            } else {
                cold += Number(sw.amountSol);
                nCold++;
            }
        }
        return { cold, loan, nCold, nLoan };
    }, [sweeps]);
    const sweepsShown = useMemo(() => (sweepView === "all" ? sweeps : sweeps.filter((sw) => (sweepView === "lend" ? sw.target === "lend" : sw.target !== "lend"))), [sweeps, sweepView]);

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
                <StatCard label="SOL deținut" value={`${stats.solHeld.toFixed(4)} SOL`} />
                <StatCard label="Ordine active" value={String(stats.openOrders)} />
            </div>

            <Last30Stats
                lots={allLots.map((l) => ({
                    status: l.status,
                    boughtAt: l.boughtAt,
                    buyAmountUsd: Number(l.buyAmountUsd),
                    buyPriceUsd: Number(l.buyPriceUsd),
                    buyFeeUsd: Number(l.buyFeeUsd),
                    soldAt: l.soldAt,
                    sellProceedsUsd: Number(l.sellProceedsUsd ?? 0),
                    realizedPnlUsd: Number(l.realizedPnlUsd ?? 0),
                    sellFeeUsd: Number(l.sellFeeUsd ?? 0),
                    targetPrice: l.targetPriceUsd ? Number(l.targetPriceUsd) : null,
                    tokensOnOrder: Number(l.sellAmountSolPlanned ?? l.solRemaining),
                }))}
                currentPrice={solPriceUsd}
                fmtUsd={formatUsd}
                fmtFee={formatUsdFee}
                fmtPrice={formatUsd}
            />

            {(() => {
                const real = allLots.filter((l) => l.status !== "FAILED");
                const profit = split30(real.map((l) => ({ t: l.soldAt ? new Date(l.soldAt).getTime() : null, v: Number(l.realizedPnlUsd ?? 0) })), nowMs);
                const sold = split30(real.map((l) => ({ t: l.soldAt ? new Date(l.soldAt).getTime() : null, v: Number(l.sellProceedsUsd ?? 0) })), nowMs);
                const cycles = split30(real.map((l) => ({ t: new Date(l.boughtAt).getTime(), v: 1 })), nowMs);
                const fills = split30(real.map((l) => ({ t: l.soldAt ? new Date(l.soldAt).getTime() : null, v: 1 })), nowMs);
                return (
                    <Compare30Card
                        note="Profitul și totalul vândut se numără în ziua în care s-a executat vânzarea; ciclurile, după data cumpărării."
                        rows={[
                            { label: "Profit realizat", ...profit, fmt: formatUsd },
                            { label: "Total vândut", ...sold, fmt: formatUsd },
                            { label: "Cicluri deschise", ...cycles, fmt: (n) => String(n) },
                            { label: "Vânzări finalizate", ...fills, fmt: (n) => String(n) },
                        ]}
                    />
                );
            })()}

            {solPriceUsd != null && (
                <NearestOrdersCards
                    title="Ordine apropiate de execuție"
                    fmt={formatUsd}
                    orders={allLots
                        .filter((l) => l.status === "OPEN" && l.targetPriceUsd)
                        .map((l) => {
                            const target = Number(l.targetPriceUsd);
                            const buy = Number(l.buyPriceUsd);
                            const amt = Number(l.sellAmountSolPlanned ?? l.solRemaining);
                            const ageDays = Math.floor((nowMs - new Date(l.boughtAt).getTime()) / 86_400_000);
                            return {
                                gap: Math.abs(target / solPriceUsd - 1),
                                o: {
                                    key: l.id,
                                    size: `${amt.toLocaleString("en-US", { maximumFractionDigits: 3 })} SOL`,
                                    ageLabel: ageDays <= 0 ? "azi" : ageDays === 1 ? "de 1 zi" : `de ${ageDays} zile`,
                                    fromLabel: "Cumpărat la",
                                    from: buy,
                                    target,
                                    current: solPriceUsd,
                                    lastLabel: "Profit",
                                    lastValue: formatUsd(amt * (target - buy)),
                                },
                            };
                        })
                        .sort((a, b) => a.gap - b.gap)
                        .slice(0, 3)
                        .map((x) => x.o)}
                />
            )}

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
                            {formatUsd(fuelStatus.usdcBalance)} USDC în portofel ÷ {formatUsd(fuelStatus.buyAmountUsd)} per cumpărare = <span className="font-medium text-foreground">{fuelStatus.buysLeft} cumpărări</span> (≈{" "}
                            <span className="font-medium text-foreground">{fuelStatus.daysRemaining} zile</span>). Botul rulează o dată pe zi, la 09:00 UTC, deci cumpără efectiv la fiecare {fuelStatus.periodHours / 24 === 1 ? "zi" : `${fuelStatus.periodHours / 24} zile`}
                            {fuelStatus.periodHours !== fuelStatus.intervalHours ? ` (intervalul setat: ${fuelStatus.intervalHours}h)` : ""}. „Acum" = soldul de acum; barele următoare = soldul după fiecare cumpărare programată.
                        </p>
                        <FuelBars data={fuelStatus.projected} buyAmountUsd={fuelStatus.buyAmountUsd} height={240} />
                    </>
                )}
            </Card>

            {!("error" in fuelStatus) && (
                <AmountAdviceCard
                    lots={allLots.map((l) => ({ boughtAt: new Date(l.boughtAt).getTime(), spendUsd: Number(l.buyAmountUsd), soldAt: l.soldAt ? new Date(l.soldAt).getTime() : null, proceedsUsd: Number(l.sellProceedsUsd ?? 0) }))}
                    balance={fuelStatus.usdcBalance}
                    buyAmount={fuelStatus.buyAmountUsd}
                    periodHours={fuelStatus.periodHours}
                    strikePct={uptime?.w30.pct ?? null}
                    noFuel30={uptime?.w30.noFuel ?? 0}
                />
            )}

            {/* Charts */}
            {uptime && <BotUptimeCard uptime={uptime} />}
            {openLotsChartData.length > 0 && <PriceRangeCard lots={openLotsChartData} currentPrice={solPriceUsd} fmt={formatUsd} />}
            {(heatLots.length > 0 || openLimitBuys.length > 0) && <ProfitHeatmap lots={heatLots} buyOrders={openLimitBuys.map((o) => ({ t: new Date(o.createdAt).getTime(), price: Number(o.limitPriceUsd), amountUsd: Number(o.amountUsd) }))} currentPrice={solPriceUsd} fmt={formatUsd} fmtUsd={formatUsd} />}

            <LotPriceChart
                lots={allLots.map((l) => ({ t: new Date(l.boughtAt).getTime(), buyPrice: Number(l.buyPriceUsd), targetPrice: l.targetPriceUsd ? Number(l.targetPriceUsd) : null, status: l.status, soldPrice: Number(l.solSold) > 0 && l.sellProceedsUsd ? Number(l.sellProceedsUsd) / Number(l.solSold) : null }))}
                currentPrice={solPriceUsd}
                fmt={formatUsd}
                limitBuys={openLimitBuys.map((o) => ({ id: o.id, limitPriceUsd: Number(o.limitPriceUsd), amountUsd: Number(o.amountUsd) }))}
            />

            <BuyTimingCard
                lots={allLots
                    .filter((l) => l.status !== "FAILED")
                    .map((l) => ({
                        id: l.id,
                        boughtAt: l.boughtAt,
                        buyPriceUsd: Number(l.buyPriceUsd),
                        buyAmountUsd: Number(l.buyAmountUsd),
                        via:
                            l.origin === "auto" || l.origin === "manual" || l.origin === "limit" || l.origin === "limit-auto"
                                ? l.origin
                                : l.id in limitLots
                                  ? limitLots[l.id]
                                      ? "limit-auto"
                                      : "limit"
                                  : "unknown",
                    }))}
                history={daily && "sources" in daily ? daily : null}
                error={daily && "error" in daily ? daily.error : null}
                fmt={formatUsd}
            />

            {chartData.length > 0 && (
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">Investit vs. încasat (cumulativ)</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="24%">
                            <defs><ChartGradients names={["violet", "green"]} /></defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => formatUsd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="invested" name="Investit cumulativ" fill={cg("violet")} radius={[6, 6, 0, 0]} maxBarSize={48} />
                            <Bar dataKey="realized" name="Încasat cumulativ" fill={cg("green")} radius={[6, 6, 0, 0]} maxBarSize={48} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Card>
            )}

            <MonthlyOrdersChart lots={lots} symbol="SOL" />

            {monthlyData.length > 0 && (
                <Card>
                    <h2 className="mb-1 text-sm font-medium text-foreground">SOL acumulat pe lună</h2>
                    <p className="mb-4 text-xs text-faint">
                        Ultimele 14 luni, doar cicluri finalizate — SOL rămas efectiv în portofel după vânzare (profitul), nu suma cumpărată. Loturile în așteptare nu sunt incluse încă, fiindcă nu se știe cât SOL rămâne până la finalizarea vânzării.
                    </p>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlyData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
                            <defs><ChartGradients names={["amber"]} /></defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => `${Number(v).toFixed(4)} SOL`}
                            />
                            <Bar dataKey="sol" name="SOL cumpărat" fill={cg("amber")} radius={[6, 6, 0, 0]} maxBarSize={64}>
                                <LabelList dataKey="sol" position="top" formatter={(v) => Number(v).toFixed(3)} style={LABEL_STYLE} />
                            </Bar>
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
                        <BarChart data={durationByPercentData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
                            <defs><ChartGradients names={["teal"]} /></defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="percent" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} label={{ value: "ore", angle: -90, position: "insideLeft", fontSize: 11, fill: "rgba(255,255,255,0.3)" }} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(value, name, item) => {
                                    const count = (item?.payload as { count?: number } | undefined)?.count ?? 0;
                                    return [`${Number(value).toFixed(1)} ore (n=${count})`, "Timp mediu"];
                                }}
                            />
                            <Bar dataKey="avgHours" name="Timp mediu" fill={cg("teal")} radius={[6, 6, 0, 0]} maxBarSize={64}>
                                <LabelList dataKey="avgHours" position="top" formatter={(v) => `${Number(v).toFixed(1)}h`} style={LABEL_STYLE} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="text-sm text-muted">
                        Niciun ciclu finalizat încă — graficul se populează automat de îndată ce primul ordin de vânzare se execută.
                    </p>
                )}
            </Card>

            <Card className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-medium text-foreground">Retrageri lunare — cold wallet și împrumut</h2>
                        <p className="mt-1 text-xs text-faint">Ultimele 14 luni, doar retrageri reușite — SOL trimis efectiv peste minimul păstrat în portofelul botului.</p>
                    </div>
                    <div role="group" aria-label="Destinația retragerilor" className="flex flex-wrap gap-2">
                        {(
                            [
                                { key: "all", label: "Toate", value: sweepTotals.cold + sweepTotals.loan, dot: "linear-gradient(135deg,#7cc4ff,#e8bc70)" },
                                { key: "cold", label: "Cold wallet", value: sweepTotals.cold, dot: "linear-gradient(135deg,#3b82f6,#7cc4ff)" },
                                { key: "lend", label: "Împrumut", value: sweepTotals.loan, dot: "linear-gradient(135deg,#f6d98f,#d49a3a)" },
                            ] as const
                        ).map((o) => (
                            <button
                                key={o.key}
                                type="button"
                                aria-pressed={sweepView === o.key}
                                onClick={() => setSweepView(o.key)}
                                className={cn(
                                    "flex min-h-[36px] items-center gap-2 rounded-full border px-3 text-xs transition-colors",
                                    sweepView === o.key ? "border-white/30 bg-white/[0.08] text-foreground" : "border-white/10 bg-white/[0.02] text-muted hover:border-white/20"
                                )}
                            >
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.dot }} />
                                {o.label}
                                <span className="font-mono text-foreground">{o.value.toFixed(2)} SOL</span>
                            </button>
                        ))}
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={monthlySweepData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                        <defs>
                            <linearGradient id="sweepCold" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#7cc4ff" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.75} />
                            </linearGradient>
                            <linearGradient id="sweepLoan" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f6d98f" />
                                <stop offset="100%" stopColor="#d49a3a" stopOpacity={0.8} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} width={44} tickFormatter={(v) => String(Number(Number(v).toFixed(3)))} />
                        <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            content={({ active, payload, label }) => {
                                const r = active ? (payload?.[0]?.payload as { cold: number; loan: number } | undefined) : undefined;
                                if (!r) return null;
                                const total = (sweepView === "lend" ? 0 : r.cold) + (sweepView === "cold" ? 0 : r.loan);
                                return (
                                    <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs shadow-xl">
                                        <p className="mb-1 text-foreground">{String(label)}</p>
                                        {sweepView !== "lend" && <p style={{ color: "#7cc4ff" }}>Cold wallet: {r.cold.toFixed(4)} SOL</p>}
                                        {sweepView !== "cold" && <p style={{ color: "#e8bc70" }}>Împrumut: {r.loan.toFixed(4)} SOL</p>}
                                        {sweepView === "all" && <p className="mt-1 border-t border-white/10 pt-1 text-muted">Total: {total.toFixed(4)} SOL</p>}
                                    </div>
                                );
                            }}
                        />
                        {sweepView !== "lend" && <Bar dataKey="cold" stackId="sweep" name="Cold wallet" fill="url(#sweepCold)" radius={sweepView === "cold" ? [5, 5, 0, 0] : [0, 0, 0, 0]} />}
                        {sweepView !== "cold" && <Bar dataKey="loan" stackId="sweep" name="Împrumut" fill="url(#sweepLoan)" radius={[5, 5, 0, 0]} />}
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            {chartData.length === 0 && (
                <Card>
                    <p className="text-sm text-muted">Niciun lot corespunde filtrelor curente — nu sunt suficiente date pentru grafice.</p>
                </Card>
            )}

            {/* One row per cycle — buy leg (always a done, confirmed transaction the
               moment a lot exists) shown together with wherever its sell side currently
               stands, instead of split across separate tables. */}
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
                <CyclesTable lots={lots} currentPriceUsd={solPriceUsd} />
            </Card>


            <Card className="overflow-x-auto">
                <h2 className="mb-1 text-sm font-medium text-foreground">
                    Retrageri lunare — istoric ({sweepsShown.length}
                    {sweepView !== "all" ? ` din ${sweeps.length}` : ""})
                </h2>
                <p className="mb-4 text-xs text-faint">
                    Fiecare încercare de retragere automată sau manuală, reușită sau nu.{sweepView !== "all" && " Filtrat după destinație — schimbă din butoanele de deasupra graficului."}
                </p>
                <SweepsTable sweeps={sweepsShown} />
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

function SolscanLink({ signature, label }: { signature: string; label: string }) {
    return (
        <a
            href={`https://solscan.io/tx/${signature}`}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted hover:text-foreground"
        >
            {label}
        </a>
    );
}

function CyclesTable({ lots: tableLots, currentPriceUsd }: { lots: LotDTO[]; currentPriceUsd: number | null }) {
    const [page, setPage] = useState(1);
    const lotFilter = useLotStatusFilter(tableLots, PENDING_STATUSES);
    const lots = lotFilter.filtered;
    const pctOf = (l: LotDTO) =>
        PENDING_STATUSES.has(l.status) && currentPriceUsd ? ((currentPriceUsd - Number(l.buyPriceUsd)) / Number(l.buyPriceUsd)) * 100 : null;
    const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));
    const { sorted, sort, toggle } = useSort<LotDTO>(
        lots,
        {
            date: (l) => new Date(l.boughtAt).getTime(),
            status: (l) => l.status,
            placed: (l) => (l.sellOrderCreatedAt ? new Date(l.sellOrderCreatedAt).getTime() : null),
            executed: (l) => (l.status === "FILLED" && l.soldAt ? new Date(l.soldAt).getTime() : null),
            days: (l) => lotTiming(l.sellOrderCreatedAt, l.status === "FILLED" ? l.soldAt : null).days,
            amount: (l) => Number(l.buyAmountUsd),
            got: (l) => Number(l.solAcquired),
            buy: (l) => Number(l.buyPriceUsd),
            fee: (l) => Number(l.buyFeeUsd),
            target: (l) => num(l.targetPriceUsd),
            current: (l) => (PENDING_STATUSES.has(l.status) ? currentPriceUsd : null),
            pct: pctOf,
            sold: (l) => num(l.sellProceedsUsd),
            pnl: (l) => num(l.realizedPnlUsd),
            remaining: (l) => Number(l.solRemaining),
            checked: (l) => (l.lastCheckedAt ? new Date(l.lastCheckedAt).getTime() : null),
        },
        { key: "date", dir: "desc" }
    );
    const onSort = (k: string) => {
        toggle(k);
        setPage(1);
    };
    if (tableLots.length === 0) return <p className="text-sm text-muted">Niciun ciclu încă.</p>;
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageStart = (Math.min(page, totalPages) - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);
    return (
        <>
            <div className="mb-4">
                <LotStatusFilter
                    labels={STATUS_LABEL_MAP}
                    counts={lotFilter.counts}
                    total={lotFilter.total}
                    selected={lotFilter.selected}
                    onChange={(next) => { lotFilter.setSelected(next); setPage(1); }}
                />
            </div>
            {lots.length === 0 && <p className="text-sm text-muted py-4">Niciun lot cu statusul selectat.</p>}
            <table className="w-full min-w-[1620px] text-left text-sm">
                <thead>
                    <tr className="text-xs uppercase tracking-wider text-faint">
                        <SortTh className="pb-2 pr-4" label="Data" k="date" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Status" k="status" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4 whitespace-nowrap" label="Ordin plasat" k="placed" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4 whitespace-nowrap" label="Executat" k="executed" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4 whitespace-nowrap" label="Zile" k="days" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Sumă" k="amount" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="SOL primit" k="got" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Preț cumpărare" k="buy" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Fee" k="fee" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Preț țintă" k="target" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Preț curent" k="current" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="%" k="pct" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Vândut" k="sold" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="P&L" k="pnl" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="SOL rămas" k="remaining" sort={sort} onSort={onSort} />
                        <SortTh className="pb-2 pr-4" label="Verificat" k="checked" sort={sort} onSort={onSort} />
                        <th className="pb-2 pr-4">Cumpărare</th>
                        <th className="pb-2">Vânzare</th>
                    </tr>
                </thead>
                <tbody>
                    {pageItems.map((lot) => {
                        const meta = statusMeta[lot.status] ?? statusMeta.PENDING_SELL_ORDER;
                        const Icon = meta.icon;
                        const isOpen = PENDING_STATUSES.has(lot.status);
                        const pctChange =
                            isOpen && currentPriceUsd ? ((currentPriceUsd - Number(lot.buyPriceUsd)) / Number(lot.buyPriceUsd)) * 100 : null;
                        return (
                            <tr key={lot.id} className="border-t border-white/[0.06]">
                                <td className="py-2 pr-4 text-muted">{format(new Date(lot.boughtAt), "d MMM, HH:mm")}</td>
                                <td className="py-2 pr-4">
                                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", meta.className)}>
                                        <Icon className="h-3 w-3" /> {meta.label}
                                    </span>
                                </td>
                                {(() => {
                                    const t = lotTiming(lot.sellOrderCreatedAt, lot.status === "FILLED" ? lot.soldAt : null);
                                    return (
                                        <>
                                            <td className="py-2 pr-4 whitespace-nowrap text-muted">{fmtLotDate(t.placed)}</td>
                                            <td className="py-2 pr-4 whitespace-nowrap text-muted">{fmtLotDate(t.executed)}</td>
                                            <td className="py-2 pr-4 whitespace-nowrap text-foreground">{fmtLotDays(t.days)}</td>
                                        </>
                                    );
                                })()}
                                <td className="py-2 pr-4 text-foreground">{formatUsd(Number(lot.buyAmountUsd))}</td>
                                <td className="py-2 pr-4 text-foreground">{Number(lot.solAcquired).toFixed(4)}</td>
                                <td className="py-2 pr-4 text-foreground">{formatUsd(Number(lot.buyPriceUsd))}</td>
                                <td className="py-2 pr-4 text-faint">{formatUsdFee(Number(lot.buyFeeUsd))}</td>
                                <td className="py-2 pr-4 text-foreground">{lot.targetPriceUsd ? formatUsd(Number(lot.targetPriceUsd)) : "—"}</td>
                                <td className="py-2 pr-4 text-foreground">{isOpen && currentPriceUsd ? formatUsd(currentPriceUsd) : "—"}</td>
                                <td className={cn("py-2 pr-4 font-medium", pctChange === null ? "text-faint" : pctChange >= 0 ? "text-emerald-300" : "text-red-300")}>
                                    {pctChange === null ? "—" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`}
                                </td>
                                <td className="py-2 pr-4 text-foreground">{lot.sellProceedsUsd ? formatUsd(Number(lot.sellProceedsUsd)) : "—"}</td>
                                <td className={cn("py-2 pr-4", lot.realizedPnlUsd && Number(lot.realizedPnlUsd) < 0 ? "text-red-300" : "text-emerald-300")}>
                                    {lot.realizedPnlUsd ? formatUsd(Number(lot.realizedPnlUsd)) : "—"}
                                </td>
                                <td className="py-2 pr-4 text-foreground">{Number(lot.solRemaining).toFixed(4)}</td>
                                <td className="py-2 pr-4 text-faint" title={lot.lastCheckedAt ? new Date(lot.lastCheckedAt).toLocaleString("ro-RO") : undefined}>
                                    {lot.lastCheckedAt
                                        ? formatDistanceToNow(new Date(lot.lastCheckedAt), { addSuffix: true })
                                        : "încă neverificat"}
                                </td>
                                <td className="py-2 pr-4 text-faint">
                                    {lot.buyTxSignature ? <SolscanLink signature={lot.buyTxSignature} label="Vezi ↗" /> : "—"}
                                </td>
                                <td className="py-2 text-faint">
                                    {lot.sellTxSignature ? (
                                        <SolscanLink signature={lot.sellTxSignature} label="Vânzare ↗" />
                                    ) : lot.sellOrderTxSignature ? (
                                        <SolscanLink signature={lot.sellOrderTxSignature} label="Creare ordin ↗" />
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
                        <th className="pb-2 pr-4">Destinație</th>
                        <th className="pb-2 pr-4">Sursă</th>
                        <th className="pb-2 pr-4">Motiv / eroare</th>
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
                                            : sweep.status === "SKIPPED"
                                              ? "text-amber-200 bg-amber-500/10 border-amber-400/30"
                                              : "text-red-300 bg-red-500/10 border-red-400/30"
                                    )}
                                >
                                    {sweep.status === "SUCCESS" ? "Trimis" : sweep.status === "SKIPPED" ? "Sub minim" : "Eșuat"}
                                </span>
                            </td>
                            <td className="py-2 pr-4 text-foreground">{Number(sweep.balanceBeforeSol).toFixed(4)} SOL</td>
                            <td className="py-2 pr-4 text-foreground">{Number(sweep.amountSol).toFixed(4)} SOL</td>
                            <td className="py-2 pr-4">
                                {sweep.target === "lend" ? (
                                    <Link
                                        href="/cold-wallet/imprumuturi"
                                        title="Deschide pagina împrumutului"
                                        className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200 transition-colors hover:border-amber-400/60 hover:bg-amber-500/20"
                                    >
                                        Împrumut{sweep.lendPositionId != null ? ` #${sweep.lendPositionId}` : ""} →
                                    </Link>
                                ) : (
                                    <span className="text-xs text-faint">Cold wallet</span>
                                )}
                            </td>
                            <td className="py-2 pr-4 text-faint">{sweep.manual ? "manual" : "automat"}</td>
                            <td className={cn("py-2 pr-4", sweep.status === "SKIPPED" ? "text-amber-200" : "text-red-300")}>{sweep.errorMessage ?? "—"}</td>
                            <td className="py-2 text-faint">
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    {sweep.txSignature ? <SolscanLink signature={sweep.txSignature} label="Vezi ↗" /> : "—"}
                                    {sweep.target === "lend" && sweep.status === "SUCCESS" && sweep.txSignature && (
                                        <Link
                                            href={`/cold-wallet/imprumuturi/tranzactii?sweep=1&tx=${sweep.txSignature}`}
                                            className="text-amber-200 underline decoration-dotted hover:text-foreground"
                                        >
                                            În împrumut →
                                        </Link>
                                    )}
                                </span>
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
