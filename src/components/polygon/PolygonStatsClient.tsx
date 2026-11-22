"use client";

import { fmtLotDate, fmtLotDays, lotTiming } from "@/lib/lot-timing";
import { SortTh, useSort } from "@/components/ui/SortableTh";
import { BotUptimeCard, type BotUptimeDTO } from "@/components/ui/BotUptimeCard";
import { FuelBars } from "@/components/solana/FuelBars";
import { ProfitHeatmap, type HeatLot } from "@/components/ui/ProfitHeatmap";
import { LotPriceChart } from "@/components/ui/LotPriceChart";
import { AmountAdviceCard } from "@/components/ui/AmountAdviceCard";
import type { PolygonTokenFuel } from "@/app/actions/polygon";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
    ComposedChart,
    Bar,
    BarChart,
    ReferenceLine,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    LabelList,
    ResponsiveContainer,
} from "recharts";
import { BarGrad, ChartGradients, cg, LABEL_STYLE } from "@/components/ui/chart-gradients";
import { format } from "date-fns";
import { ArrowLeft, TrendingUp, PiggyBank, RefreshCcw, ListChecks, History, Filter, Copy, Check, RefreshCw } from "lucide-react";
import { checkAllPolygonOrdersNow, buyBackPolygonLotNowAction } from "@/app/actions/polygon";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, Button, cn } from "@/components/ui/core";
import { LotStatusFilter, useLotStatusFilter } from "@/components/ui/LotStatusFilter";

const PAGE_SIZE = 10;

// One color per token's "Preț curent" reference line on the active-lots chart -- cycles if more than 3 tokens are ever added to ALLOWED_TOKENS.

// One color per token in the "Ordine pe lună" stacked bars.
const ORDER_COLORS = ["#e8a13a", "#60a5fa", "#f472b6", "#a78bfa"];
// ...and the matching greens for how many of them were bought back.
const FILLED_COLORS = ["#22c55e", "#2dd4bf", "#a3e635", "#86efac"];

interface TokenSettingsDTO {
    id: string;
    tokenAddress: string;
    tokenSymbol: string;
}

interface LotDTO {
    id: string;
    settingsId: string;
    status: "PENDING_BUYBACK_ORDER" | "OPEN" | "FILLED" | "CANCELLED" | "FAILED";
    tokenSold: string;
    sellPriceUsd: string;
    usdcReceived: string;
    usdcToBuyback: string;
    usdcProfit: string;
    sellTxHash: string | null;
    oneInchOrderHash: string | null;
    targetPriceUsd: string | null;
    tokenReacquired: string | null;
    usdcSpent: string | null;
    soldAt: string;
    buybackOrderCreatedAt: string | null;
    filledAt: string | null;
    notes: string | null;
    sellFeeUsd?: string | null;
}

interface SweepDTO {
    id: string;
    status: string;
    balanceBeforeUsdc: string;
    amountUsdc: string;
    destination: string;
    txHash: string | null;
    manual: boolean;
    createdAt: string;
}

interface StatsDTO {
    totalSoldUsd: number;
    totalReinvestedUsd: number;
    totalRealizedProfitUsd: number;
    totalReacquiredCount: number;
    openBuybackOrders: number;
    totalLots: number;
}

interface CurrentPriceDTO {
    settingsId: string;
    tokenSymbol: string;
    priceUsd: number | null;
}

interface Props {
    tokenKey: string;
    tokenName: string;
    uptimes?: BotUptimeDTO[];
    fuel?: { tokens: PolygonTokenFuel[]; gas: { nativeBalance: number; nativePriceUsd: number } | { error: string } | null } | null;
    tokenSettings: TokenSettingsDTO[];
    lots: LotDTO[];
    sweeps: SweepDTO[];
    // Kept out of use below — everything on this page is recomputed from the
    // (filterable) lot list instead, so the numbers always match what's
    // currently filtered in (mirrors EvmStatsClient/BnbStatsClient).
    stats: StatsDTO;
    // One live price PER TOKEN (not a single value, unlike solPriceUsd on the
    // Solana/Base/BNB/EVA stats pages) -- Polygon can run several token bots
    // at once, each at a different price. Empty array (rather than throwing)
    // when the live 1inch lookup fails -- the chart below just omits the
    // "Preț curent" reference line for that token, same "degrade, don't fail
    // the page" pattern as solPriceUsd being null there.
    currentPrices: CurrentPriceDTO[];
}

function fmtUsd(n: number): string {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Whole tokens (the bot now sells a floored whole-number amount each cycle)
// display cleanly with no decimals; older fractional lots sold before that
// change still show up to 4 decimals instead of being rounded away.
function fmtToken(n: number): string {
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

const STATUS_LABELS: Record<LotDTO["status"], string> = {
    PENDING_BUYBACK_ORDER: "Ordin în curs",
    OPEN: "Ordin activ",
    FILLED: "Răscumpărat",
    CANCELLED: "Anulat",
    FAILED: "Eșuat",
};

const STATUS_COLORS: Record<LotDTO["status"], string> = {
    PENDING_BUYBACK_ORDER: "text-orange-400 border-orange-500/20 bg-orange-500/5",
    OPEN: "text-primary border-primary/20 bg-primary/5",
    FILLED: "text-accent border-accent/20 bg-accent/5",
    CANCELLED: "text-faint border-border",
    FAILED: "text-red-300 border-red-400/20 bg-red-500/5",
};

const STATUS_FILTER_OPTIONS: { value: LotDTO["status"]; label: string }[] = [
    { value: "PENDING_BUYBACK_ORDER", label: "Ordin în curs" },
    { value: "OPEN", label: "Ordin activ" },
    { value: "FILLED", label: "Răscumpărat" },
    { value: "CANCELLED", label: "Anulat" },
    { value: "FAILED", label: "Eșuat" },
];

function StatCard({ label, value, icon: Icon, valueColor, hint }: { label: string; value: string; icon: React.ElementType; valueColor?: string; hint?: string }) {
    return (
        <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-faint text-xs uppercase tracking-wider">
                <Icon className="w-3.5 h-3.5" /> {label}
            </div>
            <p className={cn("text-2xl font-num font-medium text-foreground", valueColor)}>{value}</p>
            {hint && <p className="text-[11px] text-muted">{hint}</p>}
        </Card>
    );
}

function PolygonscanLink({ hash, label = "Vezi ↗" }: { hash: string; label?: string }) {
    return (
        <a
            href={`https://polygonscan.com/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted hover:text-foreground"
        >
            {label}
        </a>
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

export function PolygonStatsClient({ tokenKey, tokenName, tokenSettings, lots: allLots, sweeps, currentPrices, uptimes = [], fuel = null }: Props) {
    const isAdmin = useIsAdmin();
    const [now] = useState(() => Date.now()); // fixed at mount — keeps render pure
    const [checking, setChecking] = useState(false);
    const [checkMessage, setCheckMessage] = useState<string | null>(null);
    const [checkWarnings, setCheckWarnings] = useState<string[]>([]);
    const [checkError, setCheckError] = useState<string | null>(null);

    async function handleCheckNow() {
        setChecking(true);
        setCheckMessage(null);
        setCheckWarnings([]);
        setCheckError(null);
        try {
            const r = await checkAllPolygonOrdersNow();
            const parts = [`${r.checked} verificate`];
            if (r.filled > 0) parts.push(`${r.filled} răscumpărate`);
            if (r.cancelled > 0) parts.push(`${r.cancelled} anulate`);
            setCheckMessage(r.checked === 0 ? "Niciun ordin activ de verificat." : parts.join(", "));
            setCheckWarnings(r.warnings);
        } catch (err) {
            setCheckError(err instanceof Error ? err.message : "Verificarea a eșuat.");
        } finally {
            setChecking(false);
        }
    }

    // One token per page now: its id is pre-selected, so every "tokenFilter === all" branch below is just the multi-token fallback.
    const [tokenFilter, setTokenFilter] = useState<string | "all">(tokenSettings.length === 1 ? tokenSettings[0].id : "all");
    const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const symbolBySettingsId = useMemo(() => {
        const map = new Map<string, string>();
        for (const s of tokenSettings) map.set(s.id, s.tokenSymbol);
        return map;
    }, [tokenSettings]);

    const priceBySettingsId = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of currentPrices) if (p.priceUsd !== null) map.set(p.settingsId, p.priceUsd);
        return map;
    }, [currentPrices]);

    const lots = useMemo(() => {
        return allLots.filter((lot) => {
            if (tokenFilter !== "all" && lot.settingsId !== tokenFilter) return false;
            if (statusFilter.size > 0 && !statusFilter.has(lot.status)) return false;
            const soldAt = new Date(lot.soldAt).getTime();
            if (dateFrom && soldAt < new Date(dateFrom).getTime()) return false;
            if (dateTo && soldAt > new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
            return true;
        });
    }, [allLots, tokenFilter, statusFilter, dateFrom, dateTo]);

    const stats = useMemo(() => {
        let totalSoldUsd = 0;
        let totalReinvestedUsd = 0;
        let totalRealizedProfitUsd = 0;
        let totalReacquiredCount = 0;
        let openBuybackOrders = 0;
        for (const lot of lots) {
            if (lot.status === "FAILED") continue;
            totalSoldUsd += Number(lot.usdcReceived);
            totalReinvestedUsd += Number(lot.usdcToBuyback);
            totalRealizedProfitUsd += Number(lot.usdcProfit);
            if (lot.status === "OPEN") openBuybackOrders++;
            if (lot.status === "FILLED") totalReacquiredCount++;
        }
        return { totalSoldUsd, totalReinvestedUsd, totalRealizedProfitUsd, totalReacquiredCount, openBuybackOrders, totalLots: lots.length };
    }, [lots]);

    // Last 30 days + what the active buy-back orders hold — from allLots (only the token chip applies),
    // so the row stays the same whatever status/date filter is on.
    const stats30 = useMemo(() => {
        const since = now - 30 * 86_400_000;
        const base = tokenFilter === "all" ? allLots : allLots.filter((l) => l.settingsId === tokenFilter);
        let soldUsd = 0;
        let reinvestedUsd = 0;
        let profitUsd = 0;
        let sales = 0;
        let reacquired = 0;
        let reacquiredUsd = 0;
        let activeUsd = 0;
        let active = 0;
        for (const lot of base) {
            if (lot.status === "FAILED") continue;
            if (new Date(lot.soldAt).getTime() >= since) {
                soldUsd += Number(lot.usdcReceived);
                reinvestedUsd += Number(lot.usdcToBuyback);
                profitUsd += Number(lot.usdcProfit);
                sales++;
            }
            if (lot.status === "FILLED" && lot.filledAt && new Date(lot.filledAt).getTime() >= since) {
                reacquired++;
                reacquiredUsd += Number(lot.usdcSpent ?? lot.usdcToBuyback);
            }
            if (lot.status === "OPEN") {
                activeUsd += Number(lot.usdcToBuyback);
                active++;
            }
        }
        return { soldUsd, reinvestedUsd, profitUsd, sales, reacquired, reacquiredUsd, activeUsd, active };
    }, [allLots, tokenFilter, now]);

    const chartData = useMemo(() => {
        const sorted = [...lots].sort((a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime());
        const rows: { date: string; sold: number; profit: number }[] = [];
        sorted.reduce(
            (acc, lot) => {
                const sold = acc.sold + Number(lot.usdcReceived);
                const profit = acc.profit + Number(lot.usdcProfit);
                rows.push({
                    date: format(new Date(lot.soldAt), "d MMM"),
                    sold: Math.round(sold * 100) / 100,
                    profit: Math.round(profit * 100) / 100,
                });
                return { sold, profit };
            },
            { sold: 0, profit: 0 }
        );
        return rows;
    }, [lots]);

    // Fixed trailing 14-month window, respecting the current filters.
    const monthlySoldData = useMemo(() => {
        const now = new Date();
        const months: { key: string; label: string }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
        }
        const byMonth = new Map<string, number>();
        const profitByMonth = new Map<string, number>();
        for (const lot of lots) {
            const key = format(new Date(lot.soldAt), "yyyy-MM");
            byMonth.set(key, (byMonth.get(key) ?? 0) + Number(lot.usdcReceived));
            // Profit is only realized when the buy-back fills, so it lands in
            // the month of the fill (not the sale).
            if (lot.status === "FILLED" && lot.filledAt) {
                const pk = format(new Date(lot.filledAt), "yyyy-MM");
                profitByMonth.set(pk, (profitByMonth.get(pk) ?? 0) + Number(lot.usdcProfit));
            }
        }
        return months.map(({ key, label }) => ({
            month: label,
            sold: Math.round((byMonth.get(key) ?? 0) * 100) / 100,
            profit: Math.round((profitByMonth.get(key) ?? 0) * 100) / 100,
        }));
    }, [lots]);

    // Orders (sell -> buy-back cycles) started per month, one series per token,
    // same fixed 14-month window and same filters as the charts above — so
    // after a few months it's easy to see if the per-order amount should go
    // up (orders keep filling) or down (they pile up unfilled).
    const monthlyOrdersData = useMemo(() => {
        const now = new Date();
        const months: { key: string; label: string }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
        }
        const symbols = tokenSettings
            .filter((t) => lots.some((l) => l.settingsId === t.id))
            .map((t) => ({ id: t.id, symbol: t.tokenSymbol }));
        const rows = months.map(({ key, label }) => {
            const row: Record<string, number | string> = { month: label, total: 0, filled: 0, usd: 0 };
            for (const sy of symbols) { row[sy.symbol] = 0; row[`${sy.symbol} răscumpărate`] = 0; }
            for (const lot of lots) {
                if (lot.status === "FAILED" || lot.status === "CANCELLED") continue;
                if (format(new Date(lot.soldAt), "yyyy-MM") !== key) continue;
                const sym = symbols.find((x) => x.id === lot.settingsId)?.symbol;
                if (sym) row[sym] = (row[sym] as number) + 1;
                row.total = (row.total as number) + 1;
                row.usd = (row.usd as number) + Number(lot.usdcReceived);
                if (lot.status === "FILLED") {
                    row.filled = (row.filled as number) + 1;
                    if (sym) row[`${sym} răscumpărate`] = (row[`${sym} răscumpărate`] as number) + 1;
                }
            }
            row.usd = Math.round((row.usd as number) * 100) / 100;
            return row;
        });
        const active = rows.filter((r) => (r.total as number) > 0);
        const orders = active.reduce((t, r) => t + (r.total as number), 0);
        const filledTotal = active.reduce((t, r) => t + (r.filled as number), 0);
        const usd = active.reduce((t, r) => t + (r.usd as number), 0);
        return {
            rows,
            symbols: symbols.map((x) => x.symbol),
            avgPerMonth: active.length ? orders / active.length : 0,
            avgFilledPerMonth: active.length ? filledTotal / active.length : 0,
            avgOrderUsd: orders ? usd / orders : 0,
            hasData: orders > 0,
        };
    }, [lots, tokenSettings]);

    // How long each filled buy-back order actually took, grouped by its dip
    // percent below the sale price — from allLots, independent of the
    // filters above. Duration measured from when the limit order was placed
    // to the moment we detected the fill.
    const durationByPercentData = useMemo(() => {
        const groups = new Map<string, { totalHours: number; count: number; percent: number }>();
        for (const lot of allLots) {
            if (lot.status !== "FILLED" || !lot.filledAt) continue;
            const sellPrice = Number(lot.sellPriceUsd);
            const targetPrice = lot.targetPriceUsd ? Number(lot.targetPriceUsd) : null;
            if (!targetPrice || sellPrice <= 0) continue;

            const start = new Date(lot.buybackOrderCreatedAt ?? lot.soldAt).getTime();
            const end = new Date(lot.filledAt).getTime();
            const hours = (end - start) / (1000 * 60 * 60);
            if (!Number.isFinite(hours) || hours < 0) continue;

            const percent = Math.round((1 - targetPrice / sellPrice) * 1000) / 10;
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

    // Same fixed trailing 14-month window, for USDC actually sent to the
    // sweep destination — only SUCCESS rows count. Sweeps are per-user (not
    // per-token), so unaffected by the token chip.
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
            byMonth.set(key, (byMonth.get(key) ?? 0) + Number(sweep.amountUsdc));
        }
        return months.map(({ key, label }) => ({
            month: label,
            usdc: Math.round((byMonth.get(key) ?? 0) * 100) / 100,
        }));
    }, [sweeps]);

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
                <Link href={`/polygon/${tokenKey}`}>
                    <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
                </Link>
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Statistici {tokenName} Reverse-DCA</h1>
                    <p className="text-muted text-sm">Vânzări, ordine de răscumpărare{isAdmin ? " și retrageri" : ""} pentru {tokenName}.</p>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
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
            {checkWarnings.length > 0 && (
                <Card className="space-y-1 border-orange-500/20 bg-orange-500/5 p-4">
                    {checkWarnings.map((w) => (
                        <p key={w} className="text-xs text-orange-300">⚠ {w}</p>
                    ))}
                </Card>
            )}

            {tokenSettings.length > 1 && (
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setTokenFilter("all")}
                    className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        tokenFilter === "all" ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted hover:text-foreground"
                    )}
                >
                    Toate
                </button>
                {tokenSettings.map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setTokenFilter(s.id)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                            tokenFilter === s.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted hover:text-foreground"
                        )}
                    >
                        {s.tokenSymbol}
                    </button>
                ))}
            </div>
            )}

            <Card className="space-y-3 p-5">
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
                        {lots.length} din {allLots.length} loturi corespund filtrelor — cardurile, graficele și tabelul de loturi de mai jos reflectă doar selecția curentă.
                    </p>
                )}
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard label="Total vândut" value={fmtUsd(stats.totalSoldUsd)} icon={TrendingUp} />
                <StatCard label="Reinvestit în ordine" value={fmtUsd(stats.totalReinvestedUsd)} icon={RefreshCcw} />
                <StatCard label="Profit realizat" value={fmtUsd(stats.totalRealizedProfitUsd)} icon={PiggyBank} valueColor="text-accent" />
                <StatCard label="Ordine active" value={String(stats.openBuybackOrders)} icon={ListChecks} />
                <StatCard label="Răscumpărări finalizate" value={String(stats.totalReacquiredCount)} icon={RefreshCcw} />
                <StatCard label="Total loturi" value={String(stats.totalLots)} icon={History} />
            </div>

            <div>
                <p className="mb-2 text-xs text-faint">Ultimele 30 de zile · toate loturile{tokenFilter === "all" ? "" : " tokenului ales"}, indiferent de filtrele de status și dată</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <StatCard label="Vândut · 30 zile" value={fmtUsd(stats30.soldUsd)} icon={TrendingUp} hint={`${stats30.sales} ${stats30.sales === 1 ? "vânzare" : "vânzări"}`} />
                    <StatCard label="Reinvestit în ordine · 30 zile" value={fmtUsd(stats30.reinvestedUsd)} icon={RefreshCcw} />
                    <StatCard label="Profit realizat · 30 zile" value={fmtUsd(stats30.profitUsd)} icon={PiggyBank} valueColor="text-accent" />
                    <StatCard
                        label="Răscumpărări finalizate · 30 zile"
                        value={String(stats30.reacquired)}
                        icon={RefreshCcw}
                        hint={stats30.reacquired > 0 ? `${fmtUsd(stats30.reacquiredUsd)} cheltuiți` : undefined}
                    />
                    <StatCard label="Vânzări · 30 zile" value={String(stats30.sales)} icon={History} />
                    <StatCard
                        label="Valoarea ordinelor active"
                        value={stats30.active > 0 ? fmtUsd(stats30.activeUsd) : "—"}
                        icon={ListChecks}
                        hint={stats30.active > 0 ? `USDC în ${stats30.active} ${stats30.active === 1 ? "ordin" : "ordine"} de răscumpărare` : "niciun ordin activ"}
                    />
                </div>
            </div>

            {uptimes.map((u) => (
                <BotUptimeCard key={u.bot} uptime={u} />
            ))}

            {fuel && fuel.tokens.map((f) => {
                const u = uptimes.find((x) => x.label === f.tokenSymbol);
                const tokLots = allLots.filter((l) => l.settingsId === f.settingsId);
                const nTok = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " " + f.tokenSymbol;
                const nShort = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
                // Gas: average POL-denominated cost per day over the last 30 days vs. the POL left (admin only — wallet-level).
                const gas = fuel.gas && "nativeBalance" in fuel.gas ? fuel.gas : null;
                const gasLots = tokLots.filter((l) => new Date(l.soldAt).getTime() >= now - 30 * 86_400_000);
                const firstLot = tokLots.reduce((m, l) => Math.min(m, new Date(l.soldAt).getTime()), now);
                const gasDays = Math.max(1, Math.min(30, (now - firstLot) / 86_400_000));
                const gasUsdPerDay = gasLots.reduce((a, l) => a + Number(l.sellFeeUsd ?? 0), 0) / gasDays;
                const gasUsdLeft = gas ? gas.nativeBalance * gas.nativePriceUsd : 0;
                return (
                    <React.Fragment key={f.settingsId}>
                        <Card>
                            <h2 className="mb-1 text-sm font-medium text-foreground">Combustibil ({f.tokenSymbol})</h2>
                            {f.tokensPerCycle <= 0 ? (
                                <p className="text-sm text-muted">Suma pe ciclu este sub 1 {f.tokenSymbol} la prețul curent — crește suma pe ciclu în setări.</p>
                            ) : f.tokenBalance < f.tokensPerCycle ? (
                                <p className="text-sm text-muted">Portofelul are {nTok(f.tokenBalance)} (~{fmtUsd(f.tokenBalance * f.priceUsd)}), mai puțin decât o vânzare ({nTok(f.tokensPerCycle)}). Botul așteaptă să se acumuleze din minat sau din răscumpărări.</p>
                            ) : (
                                <>
                                    <p className="mb-4 text-xs text-faint">
                                        {nTok(f.tokenBalance)} (~{fmtUsd(f.tokenBalance * f.priceUsd)}) în portofel ÷ {nTok(f.tokensPerCycle)} per vânzare (~{fmtUsd(f.sellAmountUsd)}) = <span className="font-medium text-foreground">{f.cyclesLeft} vânzări</span> (≈{" "}
                                        <span className="font-medium text-foreground">{f.daysRemaining} zile</span>). Stocul se reface când se execută ordinele de răscumpărare și crește din minat — barele arată doar scăderea fără aceste reveniri.
                                    </p>
                                    <FuelBars data={f.projected} buyAmountUsd={f.tokensPerCycle} height={240} fmt={nTok} fmtShort={nShort} unit={f.tokenSymbol} action="vânzarea" actionNoun="vânzare" afterLabel="după vânzare" />
                                </>
                            )}
                            {gas && (
                                <p className="mt-3 text-xs text-muted">
                                    Gaz (POL, portofel comun): {gas.nativeBalance.toFixed(2)} POL (~{fmtUsd(gasUsdLeft)})
                                    {gasUsdPerDay > 0 && gas.nativePriceUsd > 0 ? ` — la ritmul de ${fmtUsd(gasUsdPerDay)}/zi (doar vânzările acestui token) ajunge ~${Math.floor(gasUsdLeft / gasUsdPerDay)} zile` : ""}.
                                </p>
                            )}
                        </Card>
                        {f.tokensPerCycle > 0 && (
                            <AmountAdviceCard
                                lots={tokLots.map((l) => ({ boughtAt: new Date(l.soldAt).getTime(), spendUsd: Number(l.tokenSold) * f.priceUsd, soldAt: l.filledAt ? new Date(l.filledAt).getTime() : null, proceedsUsd: Number(l.tokenReacquired ?? 0) * f.priceUsd }))}
                                balance={f.tokenBalance * f.priceUsd}
                                buyAmount={f.tokensPerCycle * f.priceUsd}
                                periodHours={f.periodHours}
                                strikePct={u?.w30.pct ?? null}
                                noFuel30={u?.w30.noFuel ?? 0}
                                unit="USD în tokeni"
                                balanceLabel="Stoc în portofel"
                                words={{ out: "vânzări", back: "răscumpărări", stock: "stocul", topup: "în tokeni (minat sau transfer)" }}
                                description={`Compară cât ${f.tokenSymbol} vinde botul pe zi cu cât revine prin răscumpărări (consum net) și cu stocul din portofel. Valorile sunt la prețul curent.`}
                                note="Calculul nu se bazează pe minat: ia în considerare doar stocul din portofel și ce vinde și răscumpără botul. „Mărește” înseamnă o sumă mai mare pe vânzare."
                            />
                        )}
                    </React.Fragment>
                );
            })}


            {tokenSettings[0] && (() => {
                const px = priceBySettingsId.get(tokenSettings[0].id) ?? null;
                const tokLots = allLots.filter((l) => tokenSettings.some((t) => t.id === l.settingsId));
                const heat: HeatLot[] = tokLots
                    .filter((l) => l.status === "OPEN" && l.targetPriceUsd)
                    .map((l) => ({ t: new Date(l.soldAt).getTime(), buyPrice: Number(l.sellPriceUsd), targetPrice: Number(l.targetPriceUsd), profitUsd: Number(l.usdcToBuyback) }));
                return (
                    <>
                        {heat.length > 0 && <ProfitHeatmap reverse lots={heat} currentPrice={px} fmt={fmtUsd} fmtUsd={fmtUsd} />}
                        <LotPriceChart
                            reverse
                            lots={tokLots.map((l) => ({
                                t: new Date(l.soldAt).getTime(),
                                buyPrice: Number(l.sellPriceUsd),
                                targetPrice: l.targetPriceUsd ? Number(l.targetPriceUsd) : null,
                                status: l.status,
                                soldPrice: l.tokenReacquired && l.usdcSpent && Number(l.tokenReacquired) > 0 ? Number(l.usdcSpent) / Number(l.tokenReacquired) : null,
                            }))}
                            currentPrice={px}
                            fmt={fmtUsd}
                        />
                    </>
                );
            })()}

            {chartData.length > 0 && (
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">Vândut vs. profit realizat (cumulativ)</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="24%">
                            <defs><ChartGradients names={["amber", "green"]} /></defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => fmtUsd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="sold" name="Vândut cumulativ" fill={cg("amber")} radius={[6, 6, 0, 0]} maxBarSize={48} />
                            <Bar dataKey="profit" name="Profit cumulativ" fill={cg("green")} radius={[6, 6, 0, 0]} maxBarSize={48} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Card>
            )}

            {monthlySoldData.length > 0 && (
                <Card>
                    <h2 className="mb-1 text-sm font-medium text-foreground">Vândut și profit pe lună</h2>
                    <p className="mb-4 text-xs text-faint">Ultimele 14 luni — suma în USDC încasată din vânzări (portocaliu) și profitul în USDC produs de ciclurile închise în luna respectivă (verde), respectă filtrele curente.</p>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlySoldData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="24%">
                            <defs><ChartGradients names={["amber", "green"]} /></defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => fmtUsd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="sold" name="Vândut" fill={cg("amber")} radius={[6, 6, 0, 0]} maxBarSize={40} />
                            <Bar dataKey="profit" name="Profit produs" fill={cg("green")} radius={[6, 6, 0, 0]} maxBarSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            )}

            {monthlyOrdersData.hasData && (
                <Card>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-medium text-foreground">Ordine pe lună</h2>
                        {tokenSettings.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                                {([{ id: "all", label: "Toate" }, ...tokenSettings.map((t) => ({ id: t.id, label: t.tokenSymbol }))]).map((o) => (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => setTokenFilter(o.id)}
                                        className={cn(
                                            "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                                            tokenFilter === o.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted hover:text-foreground"
                                        )}
                                    >
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="mb-4 text-xs text-faint">
                        Câte cicluri (vânzare → ordin de răscumpărare) s-au deschis în fiecare lună, pe token (prima coloană), și câte din ele s-au răscumpărat deja (a doua coloană, verde) — ultimele 14 luni, fără cele anulate sau eșuate, respectă filtrele curente.
                        {" "}Liniile punctate sunt mediile pe lunile cu ordine (portocaliu: plasate, verde: răscumpărate, ambele însumate pe toate tokenurile afișate). Medie {monthlyOrdersData.avgPerMonth.toFixed(1)} ordine/lună · {fmtUsd(monthlyOrdersData.avgOrderUsd)} per ordin.
                    </p>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlyOrdersData.rows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                            <defs>
                                {ORDER_COLORS.map((c, i) => <BarGrad key={`o${i}`} id={`pg-o${i}`} color={c} />)}
                                {FILLED_COLORS.map((c, i) => <BarGrad key={`f${i}`} id={`pg-f${i}`} color={c} />)}
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} interval={0} />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v, name) => [`${v} ${Number(v) === 1 ? "ordin" : "ordine"}`, String(name)]}
                                labelFormatter={(label, payload) => {
                                    const p = payload?.[0]?.payload as { total?: number; filled?: number; usd?: number } | undefined;
                                    return p && p.total ? `${label} · ${p.filled ?? 0} din ${p.total} răscumpărate · ${fmtUsd(p.usd ?? 0)} vândut` : String(label);
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <ReferenceLine
                                y={Math.round(monthlyOrdersData.avgPerMonth * 100) / 100}
                                stroke="#e8bc70"
                                strokeDasharray="6 4"
                                strokeWidth={1.5}
                                ifOverflow="extendDomain"
                                label={{ value: `Medie plasate ${monthlyOrdersData.avgPerMonth.toFixed(1)}/lună`, position: "insideTopLeft", fill: "#e8bc70", fontSize: 11 }}
                            />
                            <ReferenceLine
                                y={Math.round(monthlyOrdersData.avgFilledPerMonth * 100) / 100}
                                stroke="#4ade80"
                                strokeDasharray="6 4"
                                strokeWidth={1.5}
                                ifOverflow="extendDomain"
                                label={{ value: `Medie răscumpărate ${monthlyOrdersData.avgFilledPerMonth.toFixed(1)}/lună`, position: "insideBottomLeft", fill: "#4ade80", fontSize: 11 }}
                            />
                            {monthlyOrdersData.symbols.map((sym, i) => (
                                <Bar key={sym} dataKey={sym} name={`${sym} ordine`} stackId="orders" fill={`url(#pg-o${i % ORDER_COLORS.length})`} maxBarSize={40} radius={i === monthlyOrdersData.symbols.length - 1 ? [6, 6, 0, 0] : 0}>
                                    {monthlyOrdersData.symbols.length === 1 && <LabelList dataKey={sym} position="top" formatter={(v) => (Number(v) > 0 ? String(v) : "")} style={LABEL_STYLE} />}
                                </Bar>
                            ))}
                            {monthlyOrdersData.symbols.map((sym, i) => (
                                <Bar key={`${sym}-f`} dataKey={`${sym} răscumpărate`} name={`${sym} răscumpărate`} stackId="filled" fill={`url(#pg-f${i % FILLED_COLORS.length})`} maxBarSize={40} radius={i === monthlyOrdersData.symbols.length - 1 ? [6, 6, 0, 0] : 0}>
                                    {monthlyOrdersData.symbols.length === 1 && <LabelList dataKey={`${sym} răscumpărate`} position="top" formatter={(v) => (Number(v) > 0 ? String(v) : "")} style={LABEL_STYLE} />}
                                </Bar>
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            )}

            <Card>
                <h2 className="mb-1 text-sm font-medium text-foreground">Timp mediu până la răscumpărare, pe procent de scădere</h2>
                <p className="mb-4 text-xs text-faint">
                    Doar ordine de răscumpărare execute — de la plasarea ordinului limită până la execuție. Numărul de cicluri per bară contează — o medie din 1-2 cicluri nu e încă relevantă.
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
                        Niciun ordin de răscumpărare finalizat încă — graficul se populează automat de îndată ce primul ordin se execută.
                    </p>
                )}
            </Card>

            {isAdmin && (
            <Card>
                <h2 className="mb-1 text-sm font-medium text-foreground">Retrageri lunare către portofelul de retragere</h2>
                <p className="mb-4 text-xs text-faint">Ultimele 14 luni, doar retrageri reușite.</p>
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthlySweepData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
                        <defs><ChartGradients names={["blue"]} /></defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} />
                        <Tooltip
                            contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                            formatter={(v) => fmtUsd(Number(v))}
                        />
                        <Bar dataKey="usdc" name="USDC retras" fill={cg("blue")} radius={[6, 6, 0, 0]} maxBarSize={56} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>
            )}

            {chartData.length === 0 && (
                <Card>
                    <p className="text-sm text-muted">Niciun lot corespunde filtrelor curente — nu sunt suficiente date pentru grafice.</p>
                </Card>
            )}

            <Card className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Loturi (vânzare → răscumpărare) ({lots.length})</h3>
                <LotsTable single={tokenSettings.length <= 1} lots={lots} symbolBySettingsId={symbolBySettingsId} priceBySettingsId={priceBySettingsId} isAdmin={isAdmin} />
            </Card>

            {isAdmin && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-medium text-foreground">Retrageri (sweep USDC) ({sweeps.length})</h3>
                    <SweepsTable sweeps={sweeps} />
                </Card>
            )}
        </div>
    );
}

function LotsTable({ single, lots: tableLots, symbolBySettingsId, priceBySettingsId, isAdmin }: { single: boolean; lots: LotDTO[]; symbolBySettingsId: Map<string, string>; priceBySettingsId: Map<string, number>; isAdmin: boolean }) {
    const [page, setPage] = useState(1);
    const lotFilter = useLotStatusFilter(tableLots, ["PENDING_BUYBACK_ORDER", "OPEN"]);
    const lots = lotFilter.filtered;
    const priceOf = (l: LotDTO) => (l.status === "OPEN" ? priceBySettingsId.get(l.settingsId) ?? null : null);
    const pctOf = (l: LotDTO) => {
        const cur = priceOf(l);
        return cur !== null ? ((cur - Number(l.sellPriceUsd)) / Number(l.sellPriceUsd)) * 100 : null;
    };
    const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));
    const { sorted, sort, toggle } = useSort<LotDTO>(
        lots,
        {
            token: (l) => symbolBySettingsId.get(l.settingsId) ?? "",
            status: (l) => l.status,
            sold: (l) => Number(l.tokenSold),
            sellPrice: (l) => Number(l.sellPriceUsd),
            received: (l) => Number(l.usdcReceived),
            profit: (l) => Number(l.usdcProfit),
            target: (l) => num(l.targetPriceUsd),
            current: priceOf,
            pct: pctOf,
            rebought: (l) => num(l.tokenReacquired),
            date: (l) => new Date(l.soldAt).getTime(),
            placed: (l) => (l.buybackOrderCreatedAt ? new Date(l.buybackOrderCreatedAt).getTime() : null),
            executed: (l) => (l.status === "FILLED" && l.filledAt ? new Date(l.filledAt).getTime() : null),
            days: (l) => lotTiming(l.buybackOrderCreatedAt, l.status === "FILLED" ? l.filledAt : null).days,
        },
        { key: "date", dir: "desc" },
        ["status", "token"]
    );
    const onSort = (k: string) => {
        toggle(k);
        setPage(1);
    };
    const [copiedHash, setCopiedHash] = useState<string | null>(null);
    const [busyLotId, setBusyLotId] = useState<string | null>(null);
    const [rowMessage, setRowMessage] = useState<{ lotId: string; ok: boolean; text: string } | null>(null);

    async function handleBuyNow(lot: LotDTO) {
        if (!window.confirm("Anulez ordinul 1inch și cumpăr acum la prețul pieței, în loc să mai aștept un resolver? Suma USDC rezervată rămâne aceeași.")) return;
        setBusyLotId(lot.id);
        setRowMessage(null);
        try {
            const r = await buyBackPolygonLotNowAction(lot.id);
            setRowMessage({ lotId: lot.id, ok: r.ok, text: r.message });
        } catch (err) {
            setRowMessage({ lotId: lot.id, ok: false, text: err instanceof Error ? err.message : "Cumpărarea a eșuat." });
        } finally {
            setBusyLotId(null);
        }
    }
    // 1inch is a gasless off-chain orderbook -- there's no public page to view
    // a single order by hash (unlike a block explorer tx), so the best we can
    // offer is the hash itself, made copyable, for cross-referencing.
    const handleCopyHash = async (hash: string) => {
        try {
            await navigator.clipboard.writeText(hash);
        } catch {
            const el = document.createElement('textarea');
            el.value = hash;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
        setCopiedHash(hash);
        setTimeout(() => setCopiedHash(null), 2000);
    };
    if (tableLots.length === 0) return <p className="text-sm text-muted">Niciun lot încă.</p>;
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageStart = (Math.min(page, totalPages) - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);
    return (
        <>
            <div className="mb-4">
                <LotStatusFilter
                    labels={STATUS_LABELS}
                    counts={lotFilter.counts}
                    total={lotFilter.total}
                    selected={lotFilter.selected}
                    onChange={(next) => { lotFilter.setSelected(next); setPage(1); }}
                />
            </div>
            {lots.length === 0 && <p className="text-sm text-muted py-4">Niciun lot cu statusul selectat.</p>}
            <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm min-w-[1800px]">
                    <thead>
                        <tr className="text-left text-xs text-faint uppercase border-b border-border">
                            {!single && <SortTh className="px-6 py-2 font-medium" label="Token" k="token" sort={sort} onSort={onSort} />}
                            <SortTh className={cn("py-2 font-medium", single ? "px-6" : "px-3")} label="Status" k="status" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Vândut" k="sold" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Preț vânzare" k="sellPrice" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Încasat" k="received" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Profit realizat" k="profit" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Preț țintă răscump." k="target" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Preț curent" k="current" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium" label="%" k="pct" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Răscumpărat" k="rebought" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Data" k="date" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Ordin plasat" k="placed" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Executat" k="executed" sort={sort} onSort={onSort} />
                            <SortTh className="px-3 py-2 font-medium whitespace-nowrap" label="Zile" k="days" sort={sort} onSort={onSort} />
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Vânzare</th>
                            <th className="px-3 py-2 font-medium">Ordin 1inch</th>
                            {isAdmin && <th className="px-3 py-2 font-medium">Acțiune</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {pageItems.map((lot) => {
                            const isOpen = lot.status === "OPEN";
                            const currentPriceUsd = isOpen ? priceBySettingsId.get(lot.settingsId) ?? null : null;
                            // Vs. the lot's own execution price (sellPriceUsd) -- same "%" the
                            // Solana/Base/BNB/EVA stats tables show vs. their buyPriceUsd, just
                            // sell-side here since Polygon's cycle starts with a sell, not a buy.
                            const pctChange = currentPriceUsd !== null ? ((currentPriceUsd - Number(lot.sellPriceUsd)) / Number(lot.sellPriceUsd)) * 100 : null;
                            // Colored the OPPOSITE way from Solana's equivalent "%" column on
                            // purpose: while a lot is OPEN here, the wallet holds USDC, not the
                            // token, so a rising price (positive %) doesn't mean a gain -- it
                            // means the token is moving AWAY from the buy-back target, delaying
                            // reacquisition. A falling price (negative %) is the good outcome:
                            // progress toward buying the token back cheaper.
                            const pctIsGood = pctChange !== null && pctChange <= 0;
                            return (
                            <tr key={lot.id} className="border-b border-border/50 last:border-0 align-top">
                                {!single && (
                                    <td className="px-6 py-2.5 whitespace-nowrap text-foreground font-medium">
                                        {symbolBySettingsId.get(lot.settingsId) ?? "?"}
                                    </td>
                                )}
                                <td className={cn("py-2.5 whitespace-nowrap", single ? "px-6" : "px-3")}>
                                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", STATUS_COLORS[lot.status])}>
                                        {STATUS_LABELS[lot.status]}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">{fmtToken(Number(lot.tokenSold))}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">{fmtUsd(Number(lot.sellPriceUsd))}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-foreground">{fmtUsd(Number(lot.usdcReceived))}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-accent">{fmtUsd(Number(lot.usdcProfit))}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">
                                    {lot.targetPriceUsd ? fmtUsd(Number(lot.targetPriceUsd)) : "—"}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">
                                    {currentPriceUsd !== null ? fmtUsd(currentPriceUsd) : "—"}
                                </td>
                                <td className={cn("px-3 py-2.5 whitespace-nowrap font-num font-medium", pctChange === null ? "text-faint" : pctIsGood ? "text-emerald-300" : "text-red-300")}>
                                    {pctChange === null ? "—" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">
                                    {lot.tokenReacquired ? fmtToken(Number(lot.tokenReacquired)) : "—"}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">
                                    {new Date(lot.soldAt).toLocaleDateString("ro-RO")}
                                </td>
                                {(() => {
                                    const t = lotTiming(lot.buybackOrderCreatedAt, lot.status === "FILLED" ? lot.filledAt : null);
                                    return (
                                        <>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">{fmtLotDate(t.placed)}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">{fmtLotDate(t.executed)}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap font-num text-foreground">{fmtLotDays(t.days)}</td>
                                        </>
                                    );
                                })()}
                                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">
                                    {lot.sellTxHash ? <PolygonscanLink hash={lot.sellTxHash} /> : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-faint">
                                    {lot.oneInchOrderHash ? (
                                        <button
                                            type="button"
                                            onClick={() => handleCopyHash(lot.oneInchOrderHash!)}
                                            className="inline-flex items-center gap-1 hover:text-foreground"
                                            title="Copiază hash-ul complet al ordinului"
                                        >
                                            <code className="text-xs">{lot.oneInchOrderHash.slice(0, 10)}…</code>
                                            {copiedHash === lot.oneInchOrderHash ? (
                                                <Check className="w-3 h-3 text-accent" />
                                            ) : (
                                                <Copy className="w-3 h-3 opacity-60" />
                                            )}
                                        </button>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                                {isAdmin && (
                                    <td className="px-3 py-2.5 text-xs">
                                        {isOpen ? (
                                            <>
                                                <Button variant="outline" size="sm" onClick={() => handleBuyNow(lot)} disabled={busyLotId !== null}>
                                                    {busyLotId === lot.id ? "Se cumpără…" : "Cumpără acum"}
                                                </Button>
                                                {rowMessage?.lotId === lot.id && (
                                                    <div className={cn("mt-1 max-w-[220px] whitespace-normal text-xs", rowMessage.ok ? "text-emerald-300" : "text-red-300")}>
                                                        {rowMessage.text}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                )}
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
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
            <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm min-w-[860px]">
                    <thead>
                        <tr className="text-left text-xs text-faint uppercase border-b border-border">
                            <th className="px-6 py-2 font-medium">Data</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Balanță înainte</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Sumă trimisă</th>
                            <th className="px-3 py-2 font-medium">Tip</th>
                            <th className="px-3 py-2 font-medium">Tranzacție</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageItems.map((s) => (
                            <tr key={s.id} className="border-b border-border/50 last:border-0">
                                <td className="px-6 py-2.5 whitespace-nowrap text-xs text-faint">{new Date(s.createdAt).toLocaleString("ro-RO")}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                    <span className={cn("text-xs font-medium", s.status === "SUCCESS" ? "text-accent" : "text-red-300")}>
                                        {s.status === "SUCCESS" ? "Reușit" : "Eșuat"}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-muted">{fmtUsd(Number(s.balanceBeforeUsdc))}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-num text-foreground">{fmtUsd(Number(s.amountUsdc))}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted">{s.manual ? "manual" : "automat"}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">
                                    {s.txHash ? <PolygonscanLink hash={s.txHash} /> : "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pager page={Math.min(page, totalPages)} setPage={setPage} totalItems={sweeps.length} pageStart={pageStart} />
        </>
    );
}
