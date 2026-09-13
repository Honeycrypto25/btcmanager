import "server-only";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2BucketName } from "./client";

/**
 * Object key layout for generated invoice PDFs:
 *   users/{userId}/invoices/{invoiceId}.pdf
 *
 * Standalone from lib/r2/documents.ts on purpose (same pattern as that
 * file's own comment about not sharing code with receipts.ts) — invoices
 * are re-generated in place (edit -> regenerate PDF) rather than versioned,
 * so a fixed key per invoice is simplest. Unlike incoice's original Vercel
 * Blob storage (access: "public"), these are private objects served only
 * through a short-lived signed URL — an invoice PDF contains bank details
 * and shouldn't be reachable by anyone who merely guesses/finds the link.
 */

export function buildInvoicePdfKey(params: { userId: string; invoiceId: string }): string {
    return `users/${params.userId}/invoices/${params.invoiceId}.pdf`;
}

export async function uploadInvoicePdfObject(key: string, body: Uint8Array): Promise<void> {
    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: getR2BucketName(),
            Key: key,
            Body: Buffer.from(body),
            ContentType: "application/pdf",
        })
    );
}

/** Short-lived (default 10 min) signed GET URL — never a public R2 URL. */
export async function getSignedInvoicePdfUrl(key: string, expiresInSeconds: number = 600): Promise<string> {
    const client = getR2Client();
    const command = new GetObjectCommand({ Bucket: getR2BucketName(), Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteInvoicePdfObject(key: string): Promise<void> {
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: key }));
}
