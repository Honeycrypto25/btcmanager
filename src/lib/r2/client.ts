import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 client — R2 is S3-API-compatible, so we use the standard AWS
 * SDK pointed at R2's endpoint. Server-only: credentials must never reach
 * the browser bundle (enforced by the "server-only" import above, which
 * throws a build error if this file is ever imported from client code).
 */

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
    if (cachedClient) return cachedClient;

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error(
            "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME."
        );
    }

    cachedClient = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });

    return cachedClient;
}

export function getR2BucketName(): string {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");
    return bucket;
}

/** True once all required R2 env vars are present — lets pages show a clear
 * "storage not configured" state instead of a raw crash before setup. */
export function isR2Configured(): boolean {
    return !!(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME
    );
}
