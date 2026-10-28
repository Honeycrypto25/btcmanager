import "server-only";

/**
 * Best-effort USD price lookup for a cold-wallet sweep record.
 *
 * The price is only used for the /cold-wallet statistics, so a failed
 * lookup must never fail (or delay much) the sweep itself: any error or a
 * slow provider just stores null for that row.
 */
export async function priceForSweep(fetchPrice: () => Promise<number>, timeoutMs = 8000): Promise<number | null> {
    try {
        const price = await Promise.race([
            fetchPrice(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("price lookup timed out")), timeoutMs)),
        ]);
        return Number.isFinite(price) && price > 0 ? price : null;
    } catch (err) {
        console.warn("[sweep-price] price lookup failed:", (err as Error).message);
        return null;
    }
}
