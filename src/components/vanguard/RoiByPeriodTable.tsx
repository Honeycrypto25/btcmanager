"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Card, cn } from "@/components/ui/core";
import { getVanguardRoiByPeriod, type VanguardRoiPeriodRow } from "@/app/actions/vanguard";

function formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

/** ROI by cohort, week/month/year — same idea as the BTC ROI page
 * (/btc/roi): for each period, how much went in THAT period, and what
 * those specific units are worth today. Self-contained (own fetch/state,
 * like StatsTab's history/signals above) so it doesn't add more threaded
 * props to StatsTab itself. See getVanguardRoiByPeriod() for how periods
 * with no dated contribution ledger (e.g. a CSV-imported flat holding)
 * get folded into their holding's earliest known period rather than
 * silently dropped. */
export function RoiByPeriodTable({ provider, title = "ROI pe perioadă" }: { provider: "vanguard" | "fidelity"; title?: string }) {
    const [data, setData] = useState<{ weekly: VanguardRoiPeriodRow[]; monthly: VanguardRoiPeriodRow[]; yearly: VanguardRoiPeriodRow[] } | null>(null);
    const [view, setView] = useState<"week" | "month" | "year">("month");
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        getVanguardRoiByPeriod(provider).then(setData);
    }, [provider]);

    const rows = view === "week" ? data?.weekly : view === "year" ? data?.yearly : data?.monthly;

    const labelFor = (period: string) => {
        if (view === "week") return format(new Date(period), "dd MMM yyyy");
        if (view === "year") return period;
        return format(new Date(`${period}-01`), "MMM yyyy");
    };

    const totalPages = rows ? Math.max(1, Math.ceil(rows.length / itemsPerPage)) : 1;
    const startIndex = (page - 1) * itemsPerPage;
    const paginated = rows ? rows.slice(startIndex, startIndex + itemsPerPage) : [];

    return (
        <Card className="p-0 overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted mt-0.5">
                        Cât ai investit în fiecare perioadă și cât valorează acei bani astăzi.
                    </p>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1 w-fit">
                    {([
                        ["week", "Săptămânal"],
                        ["month", "Lunar"],
                        ["year", "Anual"],
                    ] as const).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => { setView(key); setPage(1); }}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                                view === key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {data === null ? (
                <div className="flex items-center gap-2 text-xs text-muted py-10 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă...
                </div>
            ) : !rows || rows.length === 0 ? (
                <p className="text-xs text-faint italic text-center py-10">
                    Nu există încă date suficiente pentru acest cadran.
                </p>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-white/[0.01]">
                                    <th className="px-5 sm:px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Perioadă</th>
                                    <th className="px-5 sm:px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Investit</th>
                                    <th className="px-5 sm:px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Preț mediu cumpărare</th>
                                    <th className="px-5 sm:px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Valoare acum</th>
                                    <th className="px-5 sm:px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Profit</th>
                                    <th className="px-5 sm:px-6 py-3 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">ROI</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {paginated.map((row) => (
                                    <tr key={row.period} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-5 sm:px-6 py-4 font-medium text-foreground">{labelFor(row.period)}</td>
                                        <td className="px-5 sm:px-6 py-4 text-right font-num text-muted">{formatMoney(row.invested, "GBP")}</td>
                                        <td className="px-5 sm:px-6 py-4 text-right font-num text-muted">
                                            {row.units > 0 ? formatMoney(row.invested / row.units, "GBP") : "—"}
                                        </td>
                                        <td className="px-5 sm:px-6 py-4 text-right font-num text-foreground">{formatMoney(row.currentValue, "GBP")}</td>
                                        <td className={cn("px-5 sm:px-6 py-4 text-right font-num font-medium", row.roiAmount >= 0 ? "text-green-400" : "text-red-400")}>
                                            {row.roiAmount >= 0 ? "+" : ""}{formatMoney(row.roiAmount, "GBP")}
                                        </td>
                                        <td className="px-5 sm:px-6 py-4 text-right">
                                            <span className={cn(
                                                "inline-flex items-center gap-1 font-medium px-2 py-1 rounded-lg text-xs",
                                                row.roiPercent >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                            )}>
                                                {row.roiPercent >= 0 ? "+" : ""}{row.roiPercent.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-5 sm:px-6 py-3 border-t border-border">
                            <p className="text-xs text-muted">
                                {startIndex + 1}&ndash;{Math.min(startIndex + itemsPerPage, rows.length)} din {rows.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                        page === 1 ? "text-faint cursor-not-allowed" : "text-foreground hover:bg-white/[0.05]"
                                    )}
                                >
                                    Înapoi
                                </button>
                                <button
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                        page === totalPages ? "text-faint cursor-not-allowed" : "text-foreground hover:bg-white/[0.05]"
                                    )}
                                >
                                    Înainte
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </Card>
    );
}
