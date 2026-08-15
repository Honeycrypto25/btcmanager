import "server-only";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2BucketName } from "./client";

/**
 * Object key layout (per spec):
 *   users/{userId}/receipts/{taxYear}/{year}/{month}/{receiptId}/original.<ext>
 *   users/{userId}/receipts/{taxYear}/{year}/{month}/{receiptId}/preview.webp
 *
 * The original is never overwritten. Objects are private — always accessed
 * through short-lived signed URLs generated server-side, never exposed
 * directly to the browser.
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

export function buildReceiptOriginalKey(params: {
    userId: string;
    taxYear: string;
    date: Date;
    receiptId: string;
    mimeType: string;
}): string {
    const { userId, taxYear, date, receiptId, mimeType } = params;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const ext = extensionFromMime(mimeType);
    return `users/${userId}/receipts/${taxYear}/${year}/${month}/${receiptId}/original.${ext}`;
}

export function buildReceiptPreviewKey(params: {
    userId: string;
    taxYear: string;
    date: Date;
    receiptId: string;
}): string {
    const { userId, taxYear, date, receiptId } = params;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `users/${userId}/receipts/${taxYear}/${year}/${month}/${receiptId}/preview.webp`;
}

export async function uploadReceiptObject(key: string, body: Buffer, contentType: string): Promise<void> {
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

/** Short-lived (default 10 min) signed GET URL — used both for the <img> preview and "view original" links. */
export async function getSignedReceiptUrl(key: string, expiresInSeconds: number = 600): Promise<string> {
    const client = getR2Client();
    const command = new GetObjectCommand({ Bucket: getR2BucketName(), Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteReceiptObject(key: string): Promise<void> {
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: key }));
}
