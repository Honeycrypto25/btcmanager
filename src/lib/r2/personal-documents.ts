import "server-only";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2BucketName } from "./client";

/**
 * Object key layout for the personal/family document vault:
 *   users/{userId}/personal-documents/{personalDocumentId}/{versionId}.<ext>
 *
 * Deliberately its own prefix — separate from Receipts
 * (users/{userId}/receipts/...) and the vehicle Document vault
 * (users/{userId}/documents/...) — per explicit request to keep this in
 * its own folder. Standalone file, same reasoning as lib/r2/documents.ts:
 * never share code with another upload path so one feature's changes can't
 * break another's.
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

export function buildPersonalDocumentKey(params: { userId: string; personalDocumentId: string; versionId: string; mimeType: string }): string {
    const { userId, personalDocumentId, versionId, mimeType } = params;
    const ext = extensionFromMime(mimeType);
    return `users/${userId}/personal-documents/${personalDocumentId}/${versionId}.${ext}`;
}

export async function uploadPersonalDocumentObject(key: string, body: Buffer, contentType: string): Promise<void> {
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

/** Short-lived (default 10 min) signed GET URL — used for in-app viewing.
 * Never a public R2 URL. */
export async function getSignedPersonalDocumentUrl(key: string, expiresInSeconds: number = 600): Promise<string> {
    const client = getR2Client();
    const command = new GetObjectCommand({ Bucket: getR2BucketName(), Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/** Longer-lived signed URL, used only when emailing a share link to someone
 * outside the app (they have no session to re-request a fresh one). */
export async function getSignedPersonalDocumentShareUrl(key: string, expiresInSeconds: number = 7 * 24 * 60 * 60): Promise<string> {
    const client = getR2Client();
    const command = new GetObjectCommand({ Bucket: getR2BucketName(), Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deletePersonalDocumentObject(key: string): Promise<void> {
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: key }));
}
