import "server-only";
import { unstable_cache } from "next/cache";
import { getSolPriceUsd } from "./jupiter";

export interface DailySolPrice {
    priceUsd: number;
    at: string; // ISO — when this price was taken
}

/**
 * The SOL price used to show the loan's debt "in SOL". Fetched at most once every 24 hours (cached on the server,
 * independent of the page cache, so saving a setting or paying the loan does not trigger a new price call).
 * Never throws: on failure the debt in SOL is simply not shown.
 */
export async function getDailySolPrice(): Promise<DailySolPrice | null> {
    try {
        const run = unstable_cache(async (): Promise<DailySolPrice> => ({ priceUsd: await getSolPriceUsd(), at: new Date().toISOString() }), ["sol-price-daily-v1"], {
            revalidate: 24 * 60 * 60,
            tags: ["sol-price-daily"],
        });
        const v = await run();
        return v.priceUsd > 0 ? v : null;
    } catch (err) {
        if (err && typeof err === "object" && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_")) throw err;
        return null;
    }
}
