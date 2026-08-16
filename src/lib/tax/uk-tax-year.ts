/**
 * UK tax year helpers — centralized so tax-year logic isn't duplicated
 * across pages/components. A UK tax year runs 6 April to the following
 * 5 April, and is labelled "2026-27" for the year starting 6 April 2026.
 *
 * Only date-range helpers live here. Tax rates/thresholds belong in
 * lib/tax/rules/<year>.ts (added in Phase 4), kept deliberately separate.
 */

/** Returns the UK tax year label ("2026-27") that contains the given date. */
export function getUkTaxYear(date: Date): string {
    const year = date.getFullYear();
    const aprilSixth = new Date(year, 3, 6); // month is 0-indexed: 3 = April
    const startYear = date >= aprilSixth ? year : year - 1;
    const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
    return `${startYear}-${endYearShort}`;
}

/** UK tax year label for "now". */
export function getCurrentUkTaxYear(): string {
    return getUkTaxYear(new Date());
}

/** Start (6 Apr, 00:00) and end (5 Apr next year, 23:59:59.999) for a tax year label like "2026-27". */
export function getUkTaxYearRange(taxYear: string): { start: Date; end: Date } {
    const [startYearStr] = taxYear.split("-");
    const startYear = parseInt(startYearStr, 10);
    const start = new Date(startYear, 3, 6, 0, 0, 0, 0);
    const end = new Date(startYear + 1, 3, 5, 23, 59, 59, 999);
    return { start, end };
}

/** Generates a descending list of tax year labels, most recent first. */
export function listRecentUkTaxYears(count: number = 5): string[] {
    const current = getCurrentUkTaxYear();
    const [currentStart] = current.split("-").map((s) => parseInt(s, 10));
    const years: string[] = [];
    for (let i = 0; i < count; i += 1) {
        const startYear = currentStart - i;
        const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
        years.push(`${startYear}-${endYearShort}`);
    }
    return years;
}

/**
 * Default document retention deadline for self-employed accounting records.
 * HMRC guidance: keep self-assessment records for at least 5 years after the
 * 31 January online-filing deadline for that tax year — i.e. roughly 6 years
 * after the tax year itself ends. This is a sensible default, not tax
 * advice; treat `retentionUntil` as editable per document if a longer/shorter
 * period is ever needed.
 */
export function getDefaultRetentionUntil(taxYear: string): Date {
    const { end } = getUkTaxYearRange(taxYear);
    const retentionUntil = new Date(end);
    retentionUntil.setFullYear(retentionUntil.getFullYear() + 6);
    return retentionUntil;
}

/** How many days into the current UK tax year "now" is (1-based), and the total length — useful for projections. */
export function getUkTaxYearProgress(date: Date = new Date()): { dayOfYear: number; totalDays: number } {
    const taxYear = getUkTaxYear(date);
    const { start, end } = getUkTaxYearRange(taxYear);
    const msPerDay = 24 * 60 * 60 * 1000;
    const dayOfYear = Math.floor((date.getTime() - start.getTime()) / msPerDay) + 1;
    const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
    return { dayOfYear, totalDays };
}
