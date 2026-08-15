export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isR2Configured } from "@/lib/r2/client";
import { buildReceiptOriginalKey, buildReceiptPreviewKey, uploadReceiptObject } from "@/lib/r2/receipts";
import { getUkTaxYear, getDefaultRetentionUntil } from "@/lib/tax/uk-tax-year";
import { generateHeicPreview, isHeicMimeType } from "@/lib/receipts/preview";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

function unauthorized() {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** POST: upload a receipt image/PDF — creates the original object in R2 and
 * a minimal Receipt row (status "needs_review") that the user then edits. */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return unauthorized();

    if (!isR2Configured()) {
        return NextResponse.json(
            { error: "Cloudflare R2 nu este configurat încă. Adaugă R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME în variabilele de mediu." },
            { status: 503 }
        );
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Niciun fișier primit." }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json({ error: `Tip de fișier neacceptat: ${file.type}` }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: "Fișierul depășește 15MB." }, { status: 400 });
        }

        const receiptId = randomUUID();
        const now = new Date();
        const taxYear = getUkTaxYear(now);

        const key = buildReceiptOriginalKey({ userId, taxYear, date: now, receiptId, mimeType: file.type });
        const buffer = Buffer.from(await file.arrayBuffer());
        await uploadReceiptObject(key, buffer, file.type);

        // HEIC/HEIF (default iPhone camera format) can't be rendered by an
        // <img> tag in any mainstream browser. Generate a WebP preview so the
        // receipt is actually viewable — the original HEIC is never touched.
        let previewObjectKey: string | null = null;
        let previewFileSize: number | null = null;
        if (isHeicMimeType(file.type)) {
            const previewBuffer = await generateHeicPreview(buffer);
            if (previewBuffer) {
                previewObjectKey = buildReceiptPreviewKey({ userId, taxYear, date: now, receiptId });
                await uploadReceiptObject(previewObjectKey, previewBuffer, "image/webp");
                previewFileSize = previewBuffer.length;
            }
        }

        const receipt = await db.receipt.create({
            data: {
                id: receiptId,
                userId,
                taxYear,
                currency: "GBP",
                status: "needs_review",
                originalObjectKey: key,
                originalMimeType: file.type,
                originalFileSize: file.size,
                previewObjectKey,
                previewFileSize,
                retentionUntil: getDefaultRetentionUntil(taxYear),
            },
        });

        return NextResponse.json({ receipt });
    } catch (err: any) {
        console.error("Receipt upload failed", err);
        return NextResponse.json({ error: err.message || "Upload eșuat." }, { status: 500 });
    }
}

/** GET: list the current user's receipts (metadata only — no signed URLs here, those are fetched per-receipt on demand). */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const taxYear = searchParams.get("taxYear") || undefined;
    const status = searchParams.get("status") || undefined;

    const receipts = await db.receipt.findMany({
        where: { userId, ...(taxYear ? { taxYear } : {}), ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ receipts });
}
