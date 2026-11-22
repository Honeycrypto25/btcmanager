import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { revalidatePath as nextRevalidatePath, revalidateTag, unstable_cache, updateTag } from "next/cache";

/**
 * Page cache for the main pages (Overview, Bot Act, bot pages, BTC, Cold wallet).
 *
 * Each page's data is computed once and kept (Vercel Data Cache) until something changes:
 *  - a refresh / "Verifică" button,
 *  - any server action that saves something (every one calls revalidatePath → the shim below),
 *  - a bot / sync cron run.
 * So opening a page again costs almost no server CPU. The auth check of each page stays outside the cache.
 *
 * The data loaders read the user from the session (cookies), which is not allowed inside a cache, so while a
 * page's data is being cached the user id is provided through `cachedUser` instead (see pageCacheUserId).
 */

export const PAGE_CACHE_TAG = "page-cache";
const SAFETY_TTL_SECONDS = 24 * 60 * 60; // even with no change at all, data is rebuilt at least once a day

const cachedUser = new AsyncLocalStorage<string>();

/** The user whose page data is being cached right now, if any. Every requireUserId() checks this first. */
export function pageCacheUserId(): string | undefined {
    return cachedUser.getStore();
}

// The cache stores JSON: keep Date values as Dates on the way back (props may hold them).
function encode(value: unknown): string {
    return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
        const raw = this[key];
        return raw instanceof Date ? { $date: raw.toISOString() } : v;
    });
}
function decode<T>(text: string): T {
    return JSON.parse(text, (_key, v) => (v && typeof v === "object" && typeof v.$date === "string" && Object.keys(v).length === 1 ? new Date(v.$date) : v)) as T;
}

/**
 * Returns the cached result of `load` for this page and user, computing it on a miss.
 * If caching fails for any reason (e.g. a loader still reads cookies), the page is computed normally —
 * a page can lose its cache, never break.
 */
export async function cachedPageData<T>(key: string, userId: string, load: () => Promise<T>): Promise<T> {
    try {
        const run = unstable_cache(async () => encode(await cachedUser.run(userId, load)), ["page-data-v1", key, userId], {
            tags: [PAGE_CACHE_TAG],
            revalidate: SAFETY_TTL_SECONDS,
        });
        return decode<T>(await run());
    } catch (err) {
        // Next's "dynamic usage" bailouts are control flow, not failures — let them through.
        if (err && typeof err === "object" && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_")) throw err;
        console.error(`page-cache: "${key}" served uncached`, err);
        return load();
    }
}

/**
 * Expires every cached page now. In a Server Action it is immediate for the response being built
 * (read-your-own-writes); elsewhere (cron routes) it expires right away for the next request.
 */
export function expirePageCache(): void {
    try {
        updateTag(PAGE_CACHE_TAG);
    } catch {
        try {
            revalidateTag(PAGE_CACHE_TAG, { expire: 0 });
        } catch (err) {
            console.error("page-cache: could not expire", err);
        }
    }
}

/**
 * Drop-in replacement for next/cache's revalidatePath, used by the server actions: refreshes the path as before
 * and also expires the page cache, so a saved change shows up on every page (Overview included).
 */
export function revalidatePath(path: string, type?: "layout" | "page"): void {
    nextRevalidatePath(path, type);
    expirePageCache();
}

/** The signed-in user's id from a page's session (the cache key), "" if missing. */
export function sessionUserId(session: unknown): string {
    return ((session as { user?: { id?: string } } | null | undefined)?.user?.id ?? "") as string;
}

/** For tests only. */
export const __pageCacheTest = { encode, decode, runAs: <T>(userId: string, fn: () => T) => cachedUser.run(userId, fn) };
