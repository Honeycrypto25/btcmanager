import { db } from "@/lib/db";
import { fetchFundPrice } from "@/lib/vanguard/price";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Refreshes VanguardHolding.currentValue for holdings that have BOTH a
 * ticker/ISIN and a unit count set — that's the only case we can compute a
 * new total value (price × units) for. Holdings without one or the other
 * (e.g. most OEIC funds entered without units, or nicknamed funds with no
 * ticker/ISIN at all) are left untouched and stay manually maintained.
 *
 * Unlike T212, there are no per-user API credentials involved here — this
 * is a public market-data lookup — so this runs once across every user's
 * holdings, not per-account.
 */
export async function syncVanguardPrices(): Promise<
    { ok: true; updated: number; failed: number; total: number } | { ok: false; error: string }
> {
    try {
        const holdings = await db.vanguardHolding.findMany({
            where: { ticker: { not: null }, units: { not: null } },
        });

        let updated = 0;
        let failed = 0;

        for (const h of holdings as any[]) {
            if (!h.ticker || h.units === null) continue;

            const quote = await fetchFundPrice(h.ticker);
            if (!quote) {
                failed++;
                continue;
            }

            const now = new Date();
            const currentValue = quote.price * Number(h.units);
            await db.vanguardHolding.update({
                where: { id: h.id },
                data: { currentValue, valueUpdatedAt: now },
            });

            // Record one history point per calendar day per holding -- skip
            // if we already captured one today (e.g. a manual sync click
            // right after the daily cron already ran), so the price chart
            // doesn't fill up with multiple same-day points.
            const lastPoint = await db.vanguardPriceHistory.findFirst({
                where: { holdingId: h.id },
                orderBy: { capturedAt: "desc" },
            });
            const alreadyCapturedToday = lastPoint && lastPoint.capturedAt.toDateString() === now.toDateString();
            if (!alreadyCapturedToday) {
                await db.vanguardPriceHistory.create({
                    data: { holdingId: h.id, price: quote.price, currency: quote.currency, capturedAt: now },
                });
            }

            updated++;

            // Be polite to the free/unofficial endpoints — small delay between lookups.
            await sleep(300);
        }

        return { ok: true, updated, failed, total: holdings.length };
    } catch (err: any) {
        return { ok: false, error: err?.message ?? "failed" };
    }
}
