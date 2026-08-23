"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, Button, cn } from "@/components/ui/core";
import { Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { TaxYearSelector } from "./TaxYearSelector";

interface MonthlyRow {
    label: string;
    income: number;
    expenses: number;
}

interface CategoryRow {
    category: string;
    amount: number;
}

interface SummaryProps {
    taxYear: string;
    totalIncome: number;
    totalExpenses: number;
    profit: number;
    monthlyRows: MonthlyRow[];
    expensesByCategory: CategoryRow[];
}

interface TopMerchantRow {
    merchant: string;
    amount: number;
    count: number;
}

interface ComparisonData {
    previousTaxYear: string;
    previousIncome: number;
    previousExpenses: number;
    previousProfit: number;
    incomeChangePercent: number | null;
    expensesChangePercent: number | null;
    profitChangePercent: number | null;
}

interface TrendData {
    direction: "up" | "down" | "flat";
    changePercent: number | null;
    earlyAvgProfit: number;
    recentAvgProfit: number;
}

interface AdvancedReportsData {
    taxYear: string;
    topMerchants: TopMerchantRow[];
    comparison: ComparisonData | null;
    trend: TrendData | null;
}

function formatGBP(amount: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

function formatChangePercent(pct: number | null): string {
    if (pct === null) return "n/a";
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function ReportsClient({ summary, taxYears, advanced }: { summary: SummaryProps; taxYears: string[]; advanced?: AdvancedReportsData }) {
    const highestCategory = summary.expensesByCategory[0];
    const isProfit = summary.profit >= 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Rapoarte</span>
                    </h1>
                    <p className="text-muted text-sm">An fiscal {summary.taxYear}</p>
                </div>
                <div className="flex items-center gap-2">
                    <TaxYearSelector taxYears={taxYears} selected={summary.taxYear} basePath="/self-employed/reports" />
                    <a href={`/api/self-employed/export?taxYear=${summary.taxYear}`}>
                        <Button variant="outline" size="sm">
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Export contabil
                        </Button>
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card className="p-5">
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-2">Venit total</p>
                    <p className="font-num text-xl font-medium text-foreground">{formatGBP(summary.totalIncome)}</p>
                </Card>
                <Card className="p-5">
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-2">Cheltuieli totale</p>
                    <p className="font-num text-xl font-medium text-foreground">{formatGBP(summary.totalExpenses)}</p>
                </Card>
                <Card className="p-5">
                    <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider mb-2">Profit</p>
                    <p className={`font-num text-xl font-medium ${isProfit ? "text-green-400" : "text-red-400"}`}>{formatGBP(summary.profit)}</p>
                </Card>
            </div>

            <Card className="p-5 sm:p-6">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Venit vs Cheltuieli, pe lună</h3>
                {summary.monthlyRows.length === 0 ? (
                    <p className="text-sm text-faint italic py-8 text-center">Nu există date pentru acest an fiscal.</p>
                ) : (
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={summary.monthlyRows}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" stroke="#8c8a80" fontSize={12} />
                                <YAxis stroke="#8c8a80" fontSize={12} tickFormatter={(v) => `£${v}`} />
                                <Tooltip
                                    contentStyle={{ background: "#121210", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}
                                    formatter={(value) => formatGBP(typeof value === 'number' ? value : Number(value) || 0)}
                                />
                                <Legend />
                                <Bar dataKey="income" name="Venit" fill="#52c98a" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expenses" name="Cheltuieli" fill="#d6a24c" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </Card>

            <Card className="p-5 sm:p-6">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Cheltuieli pe categorie</h3>
                {summary.expensesByCategory.length === 0 ? (
                    <p className="text-sm text-faint italic py-8 text-center">Nicio cheltuială înregistrată.</p>
                ) : (
                    <div className="space-y-2">
                        {summary.expensesByCategory.map((row) => {
                            const pct = summary.totalExpenses > 0 ? (row.amount / summary.totalExpenses) * 100 : 0;
                            return (
                                <div key={row.category} className="flex items-center gap-3">
                                    <span className="text-sm text-muted w-40 truncate">{row.category}</span>
                                    <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-sm font-medium text-foreground w-24 text-right">{formatGBP(row.amount)}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
                {highestCategory && (
                    <p className="text-xs text-faint mt-4">
                        Cea mai mare categorie: <span className="text-foreground">{highestCategory.category}</span> ({formatGBP(highestCategory.amount)})
                    </p>
                )}
            </Card>

            {advanced && (advanced.comparison || advanced.trend) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {advanced.comparison && (
                        <Card className="p-5 sm:p-6">
                            <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">
                                Comparație cu {advanced.comparison.previousTaxYear}
                            </h3>
                            <div className="space-y-3">
                                <ComparisonRow
                                    label="Venit"
                                    current={summary.totalIncome}
                                    previous={advanced.comparison.previousIncome}
                                    changePercent={advanced.comparison.incomeChangePercent}
                                    goodDirection="up"
                                />
                                <ComparisonRow
                                    label="Cheltuieli"
                                    current={summary.totalExpenses}
                                    previous={advanced.comparison.previousExpenses}
                                    changePercent={advanced.comparison.expensesChangePercent}
                                    goodDirection="down"
                                />
                                <ComparisonRow
                                    label="Profit"
                                    current={summary.profit}
                                    previous={advanced.comparison.previousProfit}
                                    changePercent={advanced.comparison.profitChangePercent}
                                    goodDirection="up"
                                />
                            </div>
                        </Card>
                    )}

                    {advanced.trend && (
                        <Card className="p-5 sm:p-6">
                            <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Trend profit (an curent)</h3>
                            <div className="flex items-center gap-3 mb-4">
                                {advanced.trend.direction === "up" && <TrendingUp className="w-5 h-5 text-green-400" />}
                                {advanced.trend.direction === "down" && <TrendingDown className="w-5 h-5 text-red-400" />}
                                {advanced.trend.direction === "flat" && <Minus className="w-5 h-5 text-muted" />}
                                <p
                                    className={cn(
                                        "text-lg font-medium font-num",
                                        advanced.trend.direction === "up" && "text-green-400",
                                        advanced.trend.direction === "down" && "text-red-400",
                                        advanced.trend.direction === "flat" && "text-muted"
                                    )}
                                >
                                    {formatChangePercent(advanced.trend.changePercent)}
                                </p>
                            </div>
                            <p className="text-xs text-faint">
                                Profit mediu/lună &mdash; prima jumătate a anului: {formatGBP(advanced.trend.earlyAvgProfit)} &middot; a doua
                                jumătate: {formatGBP(advanced.trend.recentAvgProfit)}
                            </p>
                        </Card>
                    )}
                </div>
            )}

            {advanced && advanced.topMerchants.length > 0 && (
                <Card className="p-5 sm:p-6">
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Top comercianți (cheltuieli)</h3>
                    <div className="space-y-2">
                        {advanced.topMerchants.map((m) => {
                            const pct = advanced.topMerchants[0].amount > 0 ? (m.amount / advanced.topMerchants[0].amount) * 100 : 0;
                            return (
                                <div key={m.merchant} className="flex items-center gap-3">
                                    <span className="text-sm text-muted w-40 truncate">{m.merchant}</span>
                                    <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                                        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs text-faint w-16 text-right">{m.count}x</span>
                                    <span className="text-sm font-medium text-foreground w-24 text-right">{formatGBP(m.amount)}</span>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
}

function ComparisonRow({
    label,
    current,
    previous,
    changePercent,
    goodDirection,
}: {
    label: string;
    current: number;
    previous: number;
    changePercent: number | null;
    goodDirection: "up" | "down";
}) {
    const isIncrease = changePercent !== null && changePercent > 0;
    const isGood = changePercent === null ? null : goodDirection === "up" ? isIncrease : !isIncrease;
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{label}</span>
            <div className="text-right">
                <span className="text-sm font-medium text-foreground">{formatGBP(current)}</span>
                <span className="text-xs text-faint ml-2">vs {formatGBP(previous)}</span>
                <span
                    className={cn(
                        "text-xs font-medium ml-2",
                        isGood === null ? "text-muted" : isGood ? "text-green-400" : "text-red-400"
                    )}
                >
                    {formatChangePercent(changePercent)}
                </span>
            </div>
        </div>
    );
}
