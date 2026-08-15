"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card } from "@/components/ui/core";
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

function formatGBP(amount: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

export function ReportsClient({ summary, taxYears }: { summary: SummaryProps; taxYears: string[] }) {
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
                <TaxYearSelector taxYears={taxYears} selected={summary.taxYear} basePath="/self-employed/reports" />
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
                                    formatter={(value: number | undefined) => formatGBP(value ?? 0)}
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
        </div>
    );
}
