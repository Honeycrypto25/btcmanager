"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSelfEmployedSummary } from "@/app/actions/self-employed";
import { getUkTaxYearProgress, getCurrentUkTaxYear } from "@/lib/tax/uk-tax-year";
import { getTaxRules } from "@/lib/tax/rules";
import { computeIncomeTax, computeClass4Ni } from "@/lib/tax/calculator";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface TaxEstimateInput {
    taxYear: string;
    /** Gross SIPP contribution to simulate (relief-at-source). Defaults to 0. */
    sippGrossContribution?: number;
}

/**
 * Estimates Income Tax + Class 4 NI for a tax year, from the user's own
 * Self Employed Income/Expenses records — never from client-supplied
 * totals. For the current (in-progress) tax year, also projects a
 * year-end figure from the YTD daily average.
 *
 * This is an estimate for planning purposes only, not a tax return —
 * see the disclaimer shown alongside it on the tax page.
 */
export async function getTaxEstimate(input: TaxEstimateInput) {
    await requireUserId();

    const { taxYear, sippGrossContribution = 0 } = input;
    const summary = await getSelfEmployedSummary(taxYear);
    const rules = getTaxRules(taxYear);
    const isCurrentYear = taxYear === getCurrentUkTaxYear();

    let projectedProfit = summary.profit;
    let progress: { dayOfYear: number; totalDays: number } | null = null;

    if (isCurrentYear) {
        progress = getUkTaxYearProgress();
        if (progress.dayOfYear > 0) {
            projectedProfit = (summary.profit / progress.dayOfYear) * progress.totalDays;
        }
    }

    if (!rules) {
        return {
            taxYear,
            rulesAvailable: false as const,
            ytdProfit: summary.profit,
            projectedProfit,
            isCurrentYear,
            progress,
            sippGrossContribution,
        };
    }

    const ytdIncomeTax = computeIncomeTax(summary.profit, rules, 0);
    const ytdNi = computeClass4Ni(summary.profit, rules);

    const projectedIncomeTax = computeIncomeTax(projectedProfit, rules, sippGrossContribution);
    const projectedNi = computeClass4Ni(projectedProfit, rules);

    const projectedIncomeTaxNoSipp = computeIncomeTax(projectedProfit, rules, 0);

    return {
        taxYear,
        rulesAvailable: true as const,
        rules,
        ytdProfit: summary.profit,
        projectedProfit,
        isCurrentYear,
        progress,
        sippGrossContribution,
        ytd: {
            incomeTax: ytdIncomeTax,
            ni: ytdNi,
            total: ytdIncomeTax.totalTax + ytdNi.totalNi,
        },
        projected: {
            incomeTax: projectedIncomeTax,
            ni: projectedNi,
            total: projectedIncomeTax.totalTax + projectedNi.totalNi,
        },
        projectedNoSipp: {
            incomeTax: projectedIncomeTaxNoSipp,
            total: projectedIncomeTaxNoSipp.totalTax + projectedNi.totalNi,
        },
    };
}
