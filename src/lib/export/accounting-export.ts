import "server-only";
import Papa from "papaparse";
import JSZip from "jszip";
import { db } from "@/lib/db";

/**
 * Builds a ZIP (income.csv + expenses.csv + summary.csv) for a single UK
 * tax year — meant to be handed to an accountant. Pure read + CSV/ZIP
 * formatting, no writes; reuses the same userId-scoped queries as the
 * existing Income/Expenses server actions (never trusts a client-supplied
 * userId — this is always called with the session's own id).
 */
export async function buildAccountingExportZip(userId: string, taxYear: string): Promise<Buffer> {
    const [incomes, expenses] = await Promise.all([
        db.selfEmployedIncome.findMany({ where: { userId, taxYear }, orderBy: { date: "asc" } }),
        db.selfEmployedExpense.findMany({ where: { userId, taxYear }, orderBy: { date: "asc" } }),
    ]);

    const incomeCsv = Papa.unparse({
        fields: ["Date", "Description", "Client", "Amount (GBP)", "Payment method", "Notes"],
        data: incomes.map((i: any) => [
            i.date.toISOString().slice(0, 10),
            i.description,
            i.client || "",
            Number(i.amount).toFixed(2),
            i.paymentMethod || "",
            i.notes || "",
        ]),
    });

    const expensesCsv = Papa.unparse({
        fields: ["Date", "Merchant", "Description", "Amount (GBP)", "VAT (GBP)", "Category", "Payment method", "Business use %", "Allowable status", "Notes"],
        data: expenses.map((e: any) => [
            e.date.toISOString().slice(0, 10),
            e.merchant,
            e.description || "",
            Number(e.amount).toFixed(2),
            e.vatAmount ? Number(e.vatAmount).toFixed(2) : "",
            e.category,
            e.paymentMethod || "",
            e.businessUsePercentage,
            e.allowableExpenseStatus,
            e.notes || "",
        ]),
    });

    const totalIncome = incomes.reduce((s: number, i: any) => s + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const summaryCsv = Papa.unparse({
        fields: ["Tax year", "Total income (GBP)", "Total expenses (GBP)", "Profit (GBP)", "Income records", "Expense records", "Generated on"],
        data: [[
            taxYear,
            totalIncome.toFixed(2),
            totalExpenses.toFixed(2),
            (totalIncome - totalExpenses).toFixed(2),
            incomes.length,
            expenses.length,
            new Date().toISOString().slice(0, 10),
        ]],
    });

    const zip = new JSZip();
    zip.file(`income-${taxYear}.csv`, incomeCsv);
    zip.file(`expenses-${taxYear}.csv`, expensesCsv);
    zip.file(`summary-${taxYear}.csv`, summaryCsv);

    return zip.generateAsync({ type: "nodebuffer" });
}
