"use client";

import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/core";
import { Wallet, Receipt, TrendingUp, FileText, ArrowRight } from "lucide-react";
import { TaxYearSelector } from "./TaxYearSelector";

interface SummaryProps {
    taxYear: string;
    totalIncome: number;
    totalExpenses: number;
    profit: number;
    incomeThisMonth: number;
    expensesThisMonth: number;
    averageMonthlyIncome: number;
    incomeCount: number;
    expenseCount: number;
}

function formatGBP(amount: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(amount);
}

export function SelfEmployedOverviewClient({ summary, taxYears }: { summary: SummaryProps; taxYears: string[] }) {
    const isProfit = summary.profit >= 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Self <span className="gradient-text">Employed</span>
                    </h1>
                    <p className="text-muted text-sm">Venituri, cheltuieli și profit pentru anul fiscal {summary.taxYear}.</p>
                </div>
                <TaxYearSelector taxYears={taxYears} selected={summary.taxYear} basePath="/self-employed" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Total venituri (an fiscal)</p>
                        <TrendingUp className="w-4 h-4 text-accent" />
                    </div>
                    <p className="font-num text-2xl font-medium text-foreground">{formatGBP(summary.totalIncome)}</p>
                    <p className="text-xs text-muted mt-1">{summary.incomeCount} înregistrări</p>
                </Card>

                <Card className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Total cheltuieli (an fiscal)</p>
                        <Receipt className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="font-num text-2xl font-medium text-foreground">{formatGBP(summary.totalExpenses)}</p>
                    <p className="text-xs text-muted mt-1">{summary.expenseCount} înregistrări</p>
                </Card>

                <Card className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Profit estimat</p>
                        <Wallet className="w-4 h-4 text-primary" />
                    </div>
                    <p className={`font-num text-2xl font-medium ${isProfit ? "text-green-400" : "text-red-400"}`}>
                        {formatGBP(summary.profit)}
                    </p>
                    <p className="text-xs text-muted mt-1">Venit luna curentă: {formatGBP(summary.incomeThisMonth)}</p>
                </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/self-employed/income">
                    <Card hover className="p-5 flex items-center justify-between group cursor-pointer">
                        <div>
                            <p className="font-medium text-foreground">Venituri</p>
                            <p className="text-xs text-muted mt-0.5">Adaugă și gestionează venituri</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-faint group-hover:text-primary transition-colors" />
                    </Card>
                </Link>
                <Link href="/self-employed/expenses">
                    <Card hover className="p-5 flex items-center justify-between group cursor-pointer">
                        <div>
                            <p className="font-medium text-foreground">Cheltuieli</p>
                            <p className="text-xs text-muted mt-0.5">Adaugă și gestionează cheltuieli</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-faint group-hover:text-primary transition-colors" />
                    </Card>
                </Link>
                <Link href="/self-employed/reports">
                    <Card hover className="p-5 flex items-center justify-between group cursor-pointer">
                        <div>
                            <p className="font-medium text-foreground">Rapoarte</p>
                            <p className="text-xs text-muted mt-0.5">Venit vs cheltuieli, pe categorii</p>
                        </div>
                        <FileText className="w-4 h-4 text-faint group-hover:text-primary transition-colors" />
                    </Card>
                </Link>
            </div>

            <Card className="p-5 sm:p-6">
                <p className="text-sm text-muted">
                    Medie venit lunar (luni active): <span className="text-foreground font-medium">{formatGBP(summary.averageMonthlyIncome)}</span>
                </p>
                <p className="text-xs text-faint mt-2">
                    Această pagină acoperă Phase 1 (Income, Expenses, rapoarte de bază). Chitanțe, import extras bancar și calculator de taxe
                    urmează în fazele următoare — vezi pagina Tasks pentru progres.
                </p>
            </Card>
        </div>
    );
}
