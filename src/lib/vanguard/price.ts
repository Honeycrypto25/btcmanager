import "server-only";

/**
 * Best-effort live price lookups for Vanguard holdings, used by
 * lib/vanguard-price-sync.ts. Two separate paths, dispatched from the same
 * "ticker" field on VanguardHolding, since a Vanguard holding is either:
 *
 * 1. An exchange-traded ETF (e.g. VWRL, VUSA) with an LSE ticker — priced
 *    via Yahoo Finance's public chart endpoint. No official API, but a
 *    stable JSON endpoint used by many hobby portfolio trackers, no key
 *    required.
 * 2. An OEIC/mutual fund (e.g. "FTSE Global All Cap Index Fund Acc") — has
 *    no exchange ticker, only an ISIN. There's no free official API for
 *    these at all. We read the daily NAV price off Fidelity's public
 *    factsheet page (fidelity.co.uk), which mirrors Morningstar data and is
 *    server-rendered (the price is present in the raw HTML, no JS needed).
 *    This is explicitly a scrape of a page not designed for this, accepted
 *    as a known trade-off: it can silently break if Fidelity changes their
 *    page markup, with no advance warning. Every holding still shows its
 *    own "Actualizat" timestamp so a stale price is visible, and manual
 *    editing always remains available as a fallback.
 *
 * Both paths never throw — any failure (network, unexpected page shape,
 * missing ticker) returns null so one bad lookup can't break the sync for
 * the rest of a user's holdings.
 */

export interface FundQuote {
    price: number;
    currency: string;
}

function isIsin(value: string): boolean {
    return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value.trim().toUpperCase());
}

/** LSE-listed ETF, via Yahoo Finance's public (unofficial, no-key) chart endpoint. */
async function fetchLsePrice(ticker: string): Promise<FundQuote | null> {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return null;
    const yahooSymbol = symbol.includes(".") ? symbol : `${symbol}.L`;

    try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            cache: "no-store",
        });
        if (!res.ok) return null;
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        const price = Number(meta?.regularMarketPrice);
        const currency = String(meta?.currency ?? "GBP");
        if (!Number.isFinite(price) || price <= 0) return null;

        // LSE instruments are typically quoted in GBX (pence) — normalize to
        // GBP to match how the rest of the app stores holding values (same
        // convention as the T212 GBX handling in lib/t212.ts).
        if (currency === "GBp" || currency === "GBX") {
            return { price: price / 100, currency: "GBP" };
        }
        return { price, currency };
    } catch {
        return null;
    }
}

/** OEIC/mutual fund, by ISIN, scraped off Fidelity's public factsheet page. */
async function fetchOeicPriceByIsin(isin: string): Promise<FundQuote | null> {
    const code = isin.trim().toUpperCase();
    if (!isIsin(code)) return null;

    try {
        // The slug after the ISIN doesn't need to be correct — Fidelity
        // redirects to the canonical URL as long as the ISIN prefix matches.
        const res = await fetch(`https://www.fidelity.co.uk/factsheet-data/factsheet/${code}-fund/key-statistics`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            cache: "no-store",
        });
        if (!res.ok) return null;
        const html = await res.text();

        const priceMatch = html.match(/Last buy\/sell price[\s\S]{0,300}?£\s*([\d,]+\.?\d*)/i);
        if (!priceMatch) return null;
        const price = Number(priceMatch[1].replace(/,/g, ""));
        if (!Number.isFinite(price) || price <= 0) return null;

        const currencyMatch = html.match(/Prices in (GBX|GBP|USD|EUR)/i);
        const currency = (currencyMatch?.[1] ?? "GBP").toUpperCase();
        if (currency === "GBX") {
            return { price: price / 100, currency: "GBP" };
        }
        return { price, currency };
    } catch {
        return null;
    }
}

/** Dispatches to the LSE-ticker or OEIC-ISIN lookup based on the shape of
 * the value stored in VanguardHolding.ticker. */
export async function fetchFundPrice(tickerOrIsin: string): Promise<FundQuote | null> {
    const value = tickerOrIsin.trim();
    if (!value) return null;
    return isIsin(value) ? fetchOeicPriceByIsin(value) : fetchLsePrice(value);
}
