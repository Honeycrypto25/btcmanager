"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
    ComposedChart,
    Bar,
    BarChart,
    Line,
    ReferenceLine,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { ArrowLeft, TrendingUp, PiggyBank, RefreshCcw, ListChecks, History, Filter } from "lucide-react";
import { Card, Button, cn } from "@/components/ui/core";

const PAGE_SIZE = 10;

// One color per token's "Preț curent" reference line on the active-lots chart -- cycles if more than 3 tokens are ever added to ALLOWED_TOKENS.
const REF_LINE_COLORS = ["#e5e7eb", "#60a5fa", "#f472b6"];

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

function StatCard({ label, value, icon: Icon, valueColor }: { label: string; value: string; icon: React.ElementType; valueColor?: string }) {
    return (
        <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-faint text-xs uppercase tracking-wider">
                <Icon className="w-3.5 h-3.5" /> {label}
            </div>
            <p className={cn("text-2xl font-num font-medium text-foreground", valueColor)}>{value}</p>
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

export function PolygonStatsClient({ tokenSettings, lots: allLots, sweeps, currentPrices }: Props) {
    const [tokenFilter, setTokenFilter] = useState<string | "all">("all");
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

    // Just the currently-active buy-back orders — deliberately built from
    // allLots (only respecting the token chip, not status/date), so a lot
    // drops off this chart the moment it fills or cancels rather than
    // lingering as a flat historical line. Mirrors the equivalent chart on
    // the Base/BNB/EVM stats pages.
    const openLotsChartData = useMemo(() => {
        const base = tokenFilter === "all" ? allLots : allLots.filter((l) => l.settingsId === tokenFilter);
        return base
            .filter((lot) => lot.status === "OPEN")
            .sort((a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime())
            .map((lot) => ({
                date: `${format(new Date(lot.soldAt), "d MMM")}${tokenFilter === "all" ? ` · ${symbolBySettingsId.get(lot.settingsId) ?? "?"}` : ""}`,
                settingsId: lot.settingsId,
                sellPrice: Number(lot.sellPriceUsd),
                targetPrice: lot.targetPriceUsd ? Number(lot.targetPriceUsd) : null,
            }));
    }, [allLots, tokenFilter, symbolBySettingsId]);

    // Which tokens actually have an open lot in the chart above, each paired
    // with its live price (when known) -- one "Preț curent" reference line
    // per token, since (unlike Solana/Base/BNB/EVA, one token each) Polygon
    // can have several open at once, at very different prices.
    const openLotsTokenPrices = useMemo(() => {
        const ids = new Set(openLotsChartData.map((r) => r.settingsId));
        return [...ids]
            .map((id) => ({ settingsId: id, symbol: symbolBySettingsId.get(id) ?? "?", priceUsd: priceBySettingsId.get(id) ?? null }))
            .filter((t) => t.priceUsd !== null) as { settingsId: string; symbol: string; priceUsd: number }[];
    }, [openLotsChartData, symbolBySettingsId, priceBySettingsId]);

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
        for (const lot of lots) {
            const key = format(new Date(lot.soldAt), "yyyy-MM");
            byMonth.set(key, (byMonth.get(key) ?? 0) + Number(lot.usdcReceived));
        }
        return months.map(({ key, label }) => ({
            month: label,
            sold: Math.round((byMonth.get(key) ?? 0) * 100) / 100,
        }));
    }, [lots]);

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
                <Link href="/polygon">
                    <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
                </Link>
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Statistici Polygon Reverse-DCA</h1>
                    <p className="text-muted text-sm">Vânzări, ordine de răscumpărare și retrageri, pe toate token-urile.</p>
                </div>
            </div>

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

            {openLotsChartData.length > 0 && (
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">Preț de vânzare vs. țintă de răscumpărare, per lot (ordine active)</h2>
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={openLotsChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" domain={["auto", "auto"]} />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => fmtUsd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            {openLotsTokenPrices.map((t, i) => (
                                <ReferenceLine
                                    key={t.settingsId}
                                    y={t.priceUsd}
                                    stroke={REF_LINE_COLORS[i % REF_LINE_COLORS.length]}
                                    strokeDasharray="2 3"
                                    label={{ value: `${t.symbol} preț curent: ${fmtUsd(t.priceUsd)}`, position: "insideTopRight", fill: REF_LINE_COLORS[i % REF_LINE_COLORS.length], fontSize: 11 }}
                                />
                            ))}
                            <Line type="monotone" dataKey="sellPrice" name="Preț vânzare" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="targetPrice" name="Preț țintă răscump." stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                    {openLotsTokenPrices.length === 0 && (
                        <p className="mt-2 text-[11px] text-faint">Prețul curent live e indisponibil momentan (1inch) — se afișează doar prețul de vânzare și cel țintă.</p>
                    )}
                </Card>
            )}

            {chartData.length > 0 && (
                <Card>
                    <h2 className="mb-4 text-sm font-medium text-foreground">Vândut vs. profit realizat (cumulativ)</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => fmtUsd(Number(v))}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="sold" name="Vândut cumulativ" fill="rgba(245,158,11,0.5)" />
                            <Bar dataKey="profit" name="Profit cumulativ" fill="rgba(34,197,94,0.5)" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Card>
            )}

            {monthlySoldData.length > 0 && (
                <Card>
                    <h2 className="mb-1 text-sm font-medium text-foreground">Vândut pe lună</h2>
                    <p className="mb-4 text-xs text-faint">Ultimele 14 luni — suma în USDC încasată din vânzări, respectă filtrele curente.</p>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlySoldData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                            <Tooltip
                                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v) => fmtUsd(Number(v))}
                            />
                            <Bar dataKey="sold" name="Vândut" fill="rgba(245,158,11,0.7)" radius={[4, 4, 0, 0]} />
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
                        Niciun ordin de răscumpărare finalizat încă — graficul se populează automat de îndată ce primul ordin se execută.
                    </p>
                )}
            </Card>

            <Card>
                <h2 className="mb-1 text-sm font-medium text-foreground">Retrageri lunare către portofelul de retragere</h2>
                <p className="mb-4 text-xs text-faint">Ultimele 14 luni, doar retrageri reușite.</p>
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthlySweepData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="rgba(255,255,255,0.3)" />
                        <Tooltip
                            contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                            formatter={(v) => fmtUsd(Number(v))}
                        />
                        <Bar dataKey="usdc" name="USDC retras" fill="rgba(96,165,250,0.7)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            {chartData.length === 0 && (
                <Card>
                    <p className="text-sm text-muted">Niciun lot corespunde filtrelor curente — nu sunt suficiente date pentru grafice.</p>
                </Card>
            )}

            <Card className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Loturi (vânzare → răscumpărare) ({lots.length})</h3>
                <LotsTable lots={lots} symbolBySettingsId={symbolBySettingsId} />
            </Card>

            <Card className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Retrageri (sweep USDC) ({sweeps.length})</h3>
                <SweepsTable sweeps={sweeps} />
            </Card>
        </div>
    );
}

function LotsTable({ lots, symbolBySettingsId }: { lots: LotDTO[]; symbolBySettingsId: Map<string, string> }) {
    const [page, setPage] = useState(1);
    if (lots.length === 0) return <p className="text-sm text-muted">Niciun lot încă.</p>;
    const sorted = [...lots].sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageStart = (Math.min(page, totalPages) - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);
    return (
        <>
            <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm min-w-[1180px]">
                    <thead>
                        <tr className="text-left text-xs text-faint uppercase border-b border-border">
                            <th className="px-6 py-2 font-medium">Token</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Vândut</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Preț vânzare</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Încasat</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Profit realizat</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Preț țintă răscump.</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Răscumpărat</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Data</th>
                            <th className="px-3 py-2 font-medium whitespace-nowrap">Vânzare</th>
                            <th className="px-3 py-2 font-medium">Ordin 1inch</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageItems.map((lot) => (
                            <tr key={lot.id} className="border-b border-border/50 last:border-0 align-top">
                                <td className="px-6 py-2.5 whitespace-nowrap text-foreground font-medium">
                                    {symbolBySettingsId.get(lot.settingsId) ?? "?"}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
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
                                    {lot.tokenReacquired ? fmtToken(Number(lot.tokenReacquired)) : "—"}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">
                                    {new Date(lot.soldAt).toLocaleDateString("ro-RO")}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-faint">
                                    {lot.sellTxHash ? <PolygonscanLink hash={lot.sellTxHash} /> : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-faint">
                                    {/* 1inch is a gasless off-chain orderbook — there's no fill
                                        transaction to link to. The order hash is shown instead,
                                        for cross-referencing. */}
                                    {lot.oneInchOrderHash ? <code className="text-xs">{lot.oneInchOrderHash.slice(0, 10)}…</code> : "—"}
                                </td>
                            </tr>
                        ))}
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
