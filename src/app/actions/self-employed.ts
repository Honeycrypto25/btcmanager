"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUkTaxYear, listRecentUkTaxYears } from "@/lib/tax/uk-tax-year";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

// --- Income ---

export interface IncomeInput {
    date: string; // ISO date
    description: string;
    client?: string;
    amount: number;
    paymentMethod?: string;
    notes?: string;
}

export async function createIncome(input: IncomeInput) {
    const userId = await requireUserId();
    const date = new Date(input.date);

    const income = await db.selfEmployedIncome.create({
        data: {
            userId,
            date,
            description: input.description,
            client: input.client || null,
            amount: input.amount,
            paymentMethod: input.paymentMethod || null,
            taxYear: getUkTaxYear(date),
            notes: input.notes || null,
        },
    });

    revalidatePath("/self-employed");
    revalidatePath("/self-employed/income");
    return income;
}

export async function updateIncome(id: string, input: IncomeInput) {
    const userId = await requireUserId();
    const date = new Date(input.date);

    const existing = await db.selfEmployedIncome.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const income = await db.selfEmployedIncome.update({
        where: { id },
        data: {
            date,
            description: input.description,
            client: input.client || null,
            amount: input.amount,
            paymentMethod: input.paymentMethod || null,
            taxYear: getUkTaxYear(date),
            notes: input.notes || null,
        },
    });

    revalidatePath("/self-employed");
    revalidatePath("/self-employed/income");
    return income;
}

export async function deleteIncome(id: string) {
    const userId = await requireUserId();
    const existing = await db.selfEmployedIncome.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    await db.selfEmployedIncome.delete({ where: { id } });
    revalidatePath("/self-employed");
    revalidatePath("/self-employed/income");
}

export async function listIncome(taxYear?: string) {
    const userId = await requireUserId();
    const incomes = await db.selfEmployedIncome.findMany({
        where: { userId, ...(taxYear ? { taxYear } : {}) },
        orderBy: { date: "desc" },
    });

    // Income rows created via convertTransactionToIncome (actions/bank.ts)
    // carry a soft bankTransactionId reference -- resolve it to an account
    // name here so the UI can show which bank account each income entry
    // actually came from, without a hard FK join at the schema level.
    const txIds = Array.from(new Set(incomes.map((i: any) => i.bankTransactionId).filter(Boolean))) as string[];
    const accountNameByTxId = new Map<string, string>();
    if (txIds.length > 0) {
        const txs = await db.bankTransaction.findMany({
            where: { id: { in: txIds } },
            include: { account: true },
        });
        for (const tx of txs as any[]) {
            if (tx.account) accountNameByTxId.set(tx.id, tx.account.name);
        }
    }

    return incomes.map((i: any) => ({
        ...i,
        accountName: i.bankTransactionId ? accountNameByTxId.get(i.bankTransactionId) ?? null : null,
    }));
}

// --- Expenses ---

export interface ExpenseInput {
    date: string; // ISO date
    merchant: string;
    description?: string;
    amount: number;
    vatAmount?: number;
    category: string;
    paymentMethod?: string;
    businessUsePercentage?: number;
    allowableExpenseStatus?: string;
    notes?: string;
}

export async function createExpense(input: ExpenseInput) {
    const userId = await requireUserId();
    const date = new Date(input.date);

    const expense = await db.selfEmployedExpense.create({
        data: {
            userId,
            date,
            merchant: input.merchant,
            description: input.description || null,
            amount: input.amount,
            vatAmount: input.vatAmount ?? null,
            category: input.category,
            paymentMethod: input.paymentMethod || null,
            businessUsePercentage: input.businessUsePercentage ?? 100,
            allowableExpenseStatus: input.allowableExpenseStatus || "allowable",
            taxYear: getUkTaxYear(date),
            notes: input.notes || null,
        },
    });

    revalidatePath("/self-employed");
    revalidatePath("/self-employed/expenses");
    return expense;
}

/** Lightweight category-only update -- used by the quick inline category
 * switcher on the Expenses list, so recategorizing a row (common for
 * bank-derived expenses that default to a generic category) doesn't
 * require opening the full edit form. */
export async function updateExpenseCategory(id: string, category: string) {
    const userId = await requireUserId();
    const existing = await db.selfEmployedExpense.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const expense = await db.selfEmployedExpense.update({
        where: { id },
        data: { category },
    });

    revalidatePath("/self-employed");
    revalidatePath("/self-employed/expenses");
    return expense;
}

export async function updateExpense(id: string, input: ExpenseInput) {
    const userId = await requireUserId();
    const date = new Date(input.date);

    const existing = await db.selfEmployedExpense.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const expense = await db.selfEmployedExpense.update({
        where: { id },
        data: {
            date,
            merchant: input.merchant,
            description: input.description || null,
            amount: input.amount,
            vatAmount: input.vatAmount ?? null,
            category: input.category,
            paymentMethod: input.paymentMethod || null,
            businessUsePercentage: input.businessUsePercentage ?? 100,
            allowableExpenseStatus: input.allowableExpenseStatus || "allowable",
            taxYear: getUkTaxYear(date),
            notes: input.notes || null,
        },
    });

    revalidatePath("/self-employed");
    revalidatePath("/self-employed/expenses");
    return expense;
}

export async function deleteExpense(id: string) {
    const userId = await requireUserId();
    const existing = await db.selfEmployedExpense.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    await db.selfEmployedExpense.delete({ where: { id } });
    revalidatePath("/self-employed");
    revalidatePath("/self-employed/expenses");
}

export async function listExpenses(taxYear?: string) {
    const userId = await requireUserId();
    return db.selfEmployedExpense.findMany({
        where: { userId, ...(taxYear ? { taxYear } : {}) },
        orderBy: { date: "desc" },
    });
}

// --- Overview / reports aggregation ---

export async function getSelfEmployedSummary(taxYear: string) {
    const userId = await requireUserId();

    const [incomes, expenses] = await Promise.all([
        db.selfEmployedIncome.findMany({ where: { userId, taxYear }, orderBy: { date: "asc" } }),
        db.selfEmployedExpense.findMany({ where: { userId, taxYear }, orderBy: { date: "asc" } }),
    ]);

    const totalIncome = incomes.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const profit = totalIncome - totalExpenses;

    const byMonth = new Map<string, { label: string; income: number; expenses: number }>();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const addToMonth = (date: Date, field: "income" | "expenses", amount: number) => {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        const existing = byMonth.get(key) ?? { label, income: 0, expenses: 0 };
        existing[field] += amount;
        byMonth.set(key, existing);
    };

    for (const i of incomes as any[]) addToMonth(new Date(i.date), "income", Number(i.amount));
    for (const e of expenses as any[]) addToMonth(new Date(e.date), "expenses", Number(e.amount));

    const monthlyRows = Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, v]) => v);

    const byCategory = new Map<string, number>();
    for (const e of expenses as any[]) {
        byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));
    }
    const expensesByCategory = Array.from(byCategory.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);

    const byClient = new Map<string, number>();
    for (const i of incomes as any[]) {
        const key = i.client || "Unassigned";
        byClient.set(key, (byClient.get(key) ?? 0) + Number(i.amount));
    }
    const incomeByClient = Array.from(byClient.entries())
        .map(([client, amount]) => ({ client, amount }))
        .sort((a, b) => b.amount - a.amount);

    const now = new Date();
    const isCurrentMonth = (d: Date) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    const incomeThisMonth = incomes.filter((i: any) => isCurrentMonth(new Date(i.date))).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const expensesThisMonth = expenses.filter((e: any) => isCurrentMonth(new Date(e.date))).reduce((s: number, e: any) => s + Number(e.amount), 0);

    const activeIncomeMonths = new Set(incomes.map((i: any) => `${new Date(i.date).getFullYear()}-${new Date(i.date).getMonth()}`)).size;
    const averageMonthlyIncome = activeIncomeMonths > 0 ? totalIncome / activeIncomeMonths : 0;

    return {
        taxYear,
        totalIncome,
        totalExpenses,
        profit,
        incomeThisMonth,
        expensesThisMonth,
        averageMonthlyIncome,
        monthlyRows,
        expensesByCategory,
        incomeByClient,
        incomeCount: incomes.length,
        expenseCount: expenses.length,
    };
}

// --- Advanced reports: top merchants, year-over-year comparison, trend ---

function percentChange(previous: number, current: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null; // avoid a misleading "infinite%" jump from zero
    return ((current - previous) / previous) * 100;
}

export async function getAdvancedReportsData(taxYear: string) {
    const userId = await requireUserId();

    const [expenses, currentSummary] = await Promise.all([
        db.selfEmployedExpense.findMany({ where: { userId, taxYear }, orderBy: { date: "asc" } }),
        getSelfEmployedSummary(taxYear),
    ]);

    // Top merchants by total spend (case-insensitive grouping, but keeps
    // the first-seen casing for display).
    const byMerchant = new Map<string, { merchant: string; amount: number; count: number }>();
    for (const e of expenses as any[]) {
        const key = e.merchant.trim().toLowerCase();
        const existing = byMerchant.get(key) ?? { merchant: e.merchant.trim(), amount: 0, count: 0 };
        existing.amount += Number(e.amount);
        existing.count += 1;
        byMerchant.set(key, existing);
    }
    const topMerchants = Array.from(byMerchant.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);

    // Year-over-year comparison, if a previous tax year exists in the app's
    // recent-years window.
    const recentYears = listRecentUkTaxYears(10);
    const idx = recentYears.indexOf(taxYear);
    const previousTaxYear = idx >= 0 && idx + 1 < recentYears.length ? recentYears[idx + 1] : null;

    let comparison: {
        previousTaxYear: string;
        previousIncome: number;
        previousExpenses: number;
        previousProfit: number;
        incomeChangePercent: number | null;
        expensesChangePercent: number | null;
        profitChangePercent: number | null;
    } | null = null;

    if (previousTaxYear) {
        const previousSummary = await getSelfEmployedSummary(previousTaxYear);
        comparison = {
            previousTaxYear,
            previousIncome: previousSummary.totalIncome,
            previousExpenses: previousSummary.totalExpenses,
            previousProfit: previousSummary.profit,
            incomeChangePercent: percentChange(previousSummary.totalIncome, currentSummary.totalIncome),
            expensesChangePercent: percentChange(previousSummary.totalExpenses, currentSummary.totalExpenses),
            profitChangePercent: percentChange(previousSummary.profit, currentSummary.profit),
        };
    }

    // Simple trend: average monthly profit in the first half of the
    // (chronologically sorted) months with data vs the second half.
    const chronological: { label: string; income: number; expenses: number }[] = currentSummary.monthlyRows; // already ascending (oldest month first) — see getSelfEmployedSummary above
    let trend: { direction: "up" | "down" | "flat"; changePercent: number | null; earlyAvgProfit: number; recentAvgProfit: number } | null = null;
    if (chronological.length >= 2) {
        const mid = Math.ceil(chronological.length / 2);
        const early = chronological.slice(0, mid);
        const recent = chronological.slice(mid);
        const avg = (rows: { label: string; income: number; expenses: number }[]) =>
            rows.length > 0 ? rows.reduce((s: number, r: { income: number; expenses: number }) => s + (r.income - r.expenses), 0) / rows.length : 0;
        const earlyAvgProfit = avg(early);
        const recentAvgProfit = recent.length > 0 ? avg(recent) : earlyAvgProfit;
        const changePercent = percentChange(earlyAvgProfit, recentAvgProfit);
        const direction = changePercent === null ? "flat" : changePercent > 2 ? "up" : changePercent < -2 ? "down" : "flat";
        trend = { direction, changePercent, earlyAvgProfit, recentAvgProfit };
    }

    return { taxYear, topMerchants, comparison, trend };
}
