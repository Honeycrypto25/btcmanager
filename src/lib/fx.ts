// Conversie valutară — folosită pentru a combina valoarea contului Trading212
// (care poate fi în EUR/GBP/etc.) cu portofoliul BTC (urmărit în USD).
// Folosește frankfurter.app (rate ECB, gratuit, fără API key).
//
// Notă: folosim cursul CURENT pentru toate conversiile, inclusiv pentru
// totalurile istorice lunare/anuale — o simplificare rezonabilă pentru un
// dashboard personal, dar nu perfect precisă istoric (ar necesita cursuri
// istorice per-tranzacție).

let cachedRate: { pair: string; rate: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 oră

export async function getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const pair = `${from}_${to}`;
    if (cachedRate && cachedRate.pair === pair && Date.now() - cachedRate.fetchedAt < CACHE_TTL_MS) {
        return cachedRate.rate;
    }

    try {
        const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, {
            next: { revalidate: 3600 },
        });
        if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
        const data = await res.json();
        const rate = data?.rates?.[to];
        if (typeof rate !== "number") throw new Error("Rate missing from response");

        cachedRate = { pair, rate, fetchedAt: Date.now() };
        return rate;
    } catch (err) {
        console.error("FX rate fetch failed, falling back to 1:1", err);
        return 1;
    }
}
