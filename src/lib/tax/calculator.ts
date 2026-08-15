/**
 * Pure calculation functions for the Self Employed tax estimator.
 * No DB access, no side effects — takes a profit figure + a year's
 * UkTaxYearRules and returns a breakdown. Kept separate from the
 * server action (actions/tax.ts) so the math itself is easy to reason
 * about and unit-test independently of auth/DB concerns.
 */

import type { UkTaxYearRules } from "./rules";

export interface TaxBandBreakdown {
    band: string;
    rate: number;
    taxableAmount: number;
    tax: number;
}

export interface IncomeTaxResult {
    grossProfit: number;
    personalAllowance: number;
    taxableIncome: number;
    bands: TaxBandBreakdown[];
    totalTax: number;
}

/**
 * Computes Income Tax on self-employment profit only. Does NOT account
 * for other income sources, employment income, Scottish rates/bands, or
 * pension contributions already made outside this simulator — see the
 * disclaimer shown on the tax page.
 *
 * `sippGrossContribution` models "relief at source" SIPP contributions:
 * paying into a personal pension extends the basic-rate (and
 * higher-rate) band by the GROSS contribution amount, so more income is
 * taxed at 20%/40% instead of 40%/45%. This does not change the
 * Personal Allowance taper calculation (that's based on gross income
 * before this extension), only where the higher/additional bands start.
 */
export function computeIncomeTax(
    profit: number,
    rules: UkTaxYearRules,
    sippGrossContribution: number = 0
): IncomeTaxResult {
    const grossProfit = Math.max(0, profit);

    let personalAllowance = rules.personalAllowance;
    if (grossProfit > rules.personalAllowanceTaperThreshold) {
        const excess = grossProfit - rules.personalAllowanceTaperThreshold;
        personalAllowance = Math.max(0, rules.personalAllowance - excess / 2);
    }

    const taxableIncome = Math.max(0, grossProfit - personalAllowance);

    const basicBandWidth = rules.higherRateThreshold - rules.personalAllowance + Math.max(0, sippGrossContribution);
    const higherBandWidth =
        rules.additionalRateThreshold - rules.higherRateThreshold; // SIPP shifts the whole band, width unchanged

    const bands: TaxBandBreakdown[] = [];
    let remaining = taxableIncome;

    const basicAmount = Math.max(0, Math.min(remaining, basicBandWidth));
    if (basicAmount > 0) {
        bands.push({
            band: `Rată de bază (${(rules.basicRate * 100).toFixed(0)}%)`,
            rate: rules.basicRate,
            taxableAmount: basicAmount,
            tax: basicAmount * rules.basicRate,
        });
        remaining -= basicAmount;
    }

    const higherAmount = Math.max(0, Math.min(remaining, higherBandWidth));
    if (higherAmount > 0) {
        bands.push({
            band: `Rată superioară (${(rules.higherRate * 100).toFixed(0)}%)`,
            rate: rules.higherRate,
            taxableAmount: higherAmount,
            tax: higherAmount * rules.higherRate,
        });
        remaining -= higherAmount;
    }

    if (remaining > 0) {
        bands.push({
            band: `Rată adițională (${(rules.additionalRate * 100).toFixed(0)}%)`,
            rate: rules.additionalRate,
            taxableAmount: remaining,
            tax: remaining * rules.additionalRate,
        });
    }

    const totalTax = bands.reduce((sum, b) => sum + b.tax, 0);

    return { grossProfit, personalAllowance, taxableIncome, bands, totalTax };
}

export interface Class4NiResult {
    taxableProfit: number;
    mainRateAmount: number;
    mainRateTax: number;
    additionalRateAmount: number;
    additionalRateTax: number;
    totalNi: number;
}

/** Class 4 National Insurance (self-employed profits above the lower limit). */
export function computeClass4Ni(profit: number, rules: UkTaxYearRules): Class4NiResult {
    const taxableProfit = Math.max(0, profit);

    const mainRateAmount = Math.max(
        0,
        Math.min(taxableProfit, rules.class4UpperLimit) - rules.class4LowerLimit
    );
    const additionalRateAmount = Math.max(0, taxableProfit - rules.class4UpperLimit);

    const mainRateTax = mainRateAmount * rules.class4MainRate;
    const additionalRateTax = additionalRateAmount * rules.class4AdditionalRate;

    return {
        taxableProfit,
        mainRateAmount,
        mainRateTax,
        additionalRateAmount,
        additionalRateTax,
        totalNi: mainRateTax + additionalRateTax,
    };
}
