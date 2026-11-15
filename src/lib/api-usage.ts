import "server-only";
import { db } from "@/lib/db";

export type ApiProvider = "1inch" | "jupiter";

/**
 * Counts one request the platform sent to an external API (per provider + bucket + UTC day).
 * Best-effort: counting must never break (or noticeably slow) the call it counts.
 */
export async function trackApiCall(provider: ApiProvider, bucket: string, status?: number | "error"): Promise<void> {
    const limited = status === 429 ? 1 : 0;
    const failed = status === "error" || (typeof status === "number" && status >= 400 && status !== 429) ? 1 : 0;
    try {
        await db.$executeRaw`
            INSERT INTO "ApiUsageDaily" ("id", "provider", "bucket", "day", "count", "limited", "errors")
            VALUES (gen_random_uuid()::text, ${provider}, ${bucket}, (now() AT TIME ZONE 'utc')::date, 1, ${limited}, ${failed})
            ON CONFLICT ("provider", "bucket", "day") DO UPDATE
            SET "count" = "ApiUsageDaily"."count" + 1,
                "limited" = "ApiUsageDaily"."limited" + EXCLUDED."limited",
                "errors" = "ApiUsageDaily"."errors" + EXCLUDED."errors"`;
    } catch (err) {
        console.error(`trackApiCall failed for ${provider}/${bucket}`, err);
    }
}

/** "https://api.1inch.dev/swap/v6.1/8453/quote?…" → "swap:8453" (product + chain id). */
export function oneInchBucket(url: string): string {
    try {
        const parts = new URL(url).pathname.split("/").filter(Boolean);
        const chain = parts.find((p) => /^\d+$/.test(p));
        return `${parts[0] ?? "other"}${chain ? `:${chain}` : ""}`;
    } catch {
        return "other";
    }
}

/** "https://api.jup.ag/trigger/v1/createOrder" → "trigger" (first path segment = the Jupiter product). */
export function jupiterBucket(url: string): string {
    try {
        return new URL(url).pathname.split("/").filter(Boolean)[0] ?? "other";
    } catch {
        return "other";
    }
}

interface HttpConnector {
    get<T>(url: string, headers: Record<string, string>): Promise<T>;
    post<T>(url: string, data: unknown, headers: Record<string, string>): Promise<T>;
}

/** Wraps the 1inch SDK's HTTP connector so the orderbook calls it makes on its own are counted too. */
export function countingOneInchConnector(inner: HttpConnector): HttpConnector {
    const run = async <T>(url: string, call: () => Promise<T>): Promise<T> => {
        try {
            const out = await call();
            await trackApiCall("1inch", oneInchBucket(url));
            return out;
        } catch (err) {
            await trackApiCall("1inch", oneInchBucket(url), /\b429\b/.test(String(err)) ? 429 : "error");
            throw err;
        }
    };
    return {
        get: (url, headers) => run(url, () => inner.get(url, headers)),
        post: (url, data, headers) => run(url, () => inner.post(url, data, headers)),
    };
}
