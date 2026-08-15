import "server-only";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2BucketName } from "./client";

/**
 * Object key layout for the generic document vault (Phase 5):
 *   users/{userId}/documents/{category}/{documentId}/original.<ext>
 *
 * Deliberately a standalone file (not sharing code with lib/r2/receipts.ts)
 * so Phase 2's Receipts upload path — already live in production — is
 * never touched by Phase 5 changes. The underlying R2 operations are the
 * same small amount of S3 boilerplate either way.
 */

function extensionFromMime(mime: string): string {
    const map: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "application/pdf": "pdf",
    };
    return map[mime] || "bin";
}

function slugify(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "other";
}

export function buildDocumentKey(params: { userId: string; category: string; documentId: string; mimeType: string }): string {
    const { userId, category, documentId, mimeType } = params;
    const ext = extensionFromMime(mimeType);
    return `users/${userId}/documents/${slugify(category)}/${documentId}/original.${ext}`;
}

export async function uploadDocumentObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: getR2BucketName(),
            Key: key,
            Body: body,
            ContentType: contentType,
        })
    );
}

/** Short-lived (default 10 min) signed GET URL — never a public R2 URL. */
export async function getSignedDocumentUrl(key: string, expiresInSeconds: number = 600): Promise<string> {
    const client = getR2Client();
    const command = new GetObjectCommand({ Bucket: getR2BucketName(), Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteDocumentObject(key: string): Promise<void> {
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: key }));
}
