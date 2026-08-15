/**
 * Centralized UK tax rules per tax year, for the Self Employed tax
 * estimator (Phase 4). Figures are the published HMRC/gov.uk rates for
 * each tax year (6 Apr – 5 Apr). This module is deliberately separate
 * from lib/tax/uk-tax-year.ts, which only handles date-range logic.
 *
 * IMPORTANT: this powers an ESTIMATE tool, not a substitute for HMRC's
 * own calculators or professional advice. Rates for 2022-23 in
 * particular reflect a mid-year change (Health & Social Care Levy) and
 * are the commonly-used blended annual rate, not a month-by-month
 * calculation.
 *
 * Class 2 NI is intentionally NOT part of the numeric estimate: since
 * 2024/25 it is voluntary for most self-employed people (only relevant
 * if you want to protect a State Pension qualifying year on low
 * profits) — see class2Note, shown as an informational note only.
 */

export interface UkTaxYearRules {
    taxYear: string;
    personalAllowance: number;
    /** Income above this reduces the Personal Allowance by £1 per £2 over. */
    personalAllowanceTaperThreshold: number;
    /** Personal Allowance reaches £0 at this income level. */
    personalAllowanceTaperEnd: number;
    basicRate: number;
    higherRate: number;
    additionalRate: number;
    /** Total income at which the higher rate starts. */
    higherRateThreshold: number;
    /** Total income at which the additional rate starts. */
    additionalRateThreshold: number;
    class4LowerLimit: number;
    class4UpperLimit: number;
    class4MainRate: number;
    class4AdditionalRate: number;
    class2Note: string;
}

const CLASS2_NOTE_VOLUNTARY =
    "Class 2 NI e opțională din 2024/25 — o poți plăti voluntar (o sumă mică, săptămânală) doar dacă vrei să aperi acel an ca an complet pentru pensia de stat, la profituri mici. Nu e inclusă în estimarea de mai sus.";

const CLASS2_NOTE_COMPULSORY =
    "Class 2 NI era obligatorie la profituri peste pragul minim în acest an fiscal (o sumă fixă săptămânală). Nu e inclusă în estimarea de mai sus — verifică gov.uk pentru suma exactă aplicabilă anului.";

export const UK_TAX_RULES: Record<string, UkTaxYearRules> = {
    "2026-27": {
        taxYear: "2026-27",
        personalAllowance: 12570,
        personalAllowanceTaperThreshold: 100000,
        personalAllowanceTaperEnd: 125140,
        basicRate: 0.20,
        higherRate: 0.40,
        additionalRate: 0.45,
        higherRateThreshold: 50270,
        additionalRateThreshold: 125140,
        class4LowerLimit: 12570,
        class4UpperLimit: 50270,
        class4MainRate: 0.06,
        class4AdditionalRate: 0.02,
        class2Note: CLASS2_NOTE_VOLUNTARY,
    },
    "2025-26": {
        taxYear: "2025-26",
        personalAllowance: 12570,
        personalAllowanceTaperThreshold: 100000,
        personalAllowanceTaperEnd: 125140,
        basicRate: 0.20,
        higherRate: 0.40,
        additionalRate: 0.45,
        higherRateThreshold: 50270,
        additionalRateThreshold: 125140,
        class4LowerLimit: 12570,
        class4UpperLimit: 50270,
        class4MainRate: 0.06,
        class4AdditionalRate: 0.02,
        class2Note: CLASS2_NOTE_VOLUNTARY,
    },
    "2024-25": {
        taxYear: "2024-25",
        personalAllowance: 12570,
        personalAllowanceTaperThreshold: 100000,
        personalAllowanceTaperEnd: 125140,
        basicRate: 0.20,
        higherRate: 0.40,
        additionalRate: 0.45,
        higherRateThreshold: 50270,
        additionalRateThreshold: 125140,
        class4LowerLimit: 12570,
        class4UpperLimit: 50270,
        class4MainRate: 0.06,
        class4AdditionalRate: 0.02,
        class2Note: CLASS2_NOTE_VOLUNTARY,
    },
    "2023-24": {
        taxYear: "2023-24",
        personalAllowance: 12570,
        personalAllowanceTaperThreshold: 100000,
        personalAllowanceTaperEnd: 125140,
        basicRate: 0.20,
        higherRate: 0.40,
        additionalRate: 0.45,
        higherRateThreshold: 50270,
        additionalRateThreshold: 125140,
        class4LowerLimit: 12570,
        class4UpperLimit: 50270,
        class4MainRate: 0.09,
        class4AdditionalRate: 0.02,
        class2Note: CLASS2_NOTE_COMPULSORY,
    },
    "2022-23": {
        taxYear: "2022-23",
        personalAllowance: 12570,
        personalAllowanceTaperThreshold: 100000,
        personalAllowanceTaperEnd: 125140,
        basicRate: 0.20,
        higherRate: 0.40,
        additionalRate: 0.45,
        higherRateThreshold: 50270,
        // Additional rate threshold was still £150,000 in 2022-23 (lowered
        // to £125,140 from 2023-24 onwards).
        additionalRateThreshold: 150000,
        // Blended annual rate: Health & Social Care Levy applied Apr–Nov
        // 2022 then was reversed, giving HMRC's published blended rates
        // for self-assessment of 9.73% / 2.73% rather than a flat 9%/2%.
        class4LowerLimit: 11908,
        class4UpperLimit: 50270,
        class4MainRate: 0.0973,
        class4AdditionalRate: 0.0273,
        class2Note: CLASS2_NOTE_COMPULSORY,
    },
};

export function getTaxRules(taxYear: string): UkTaxYearRules | null {
    return UK_TAX_RULES[taxYear] ?? null;
}
