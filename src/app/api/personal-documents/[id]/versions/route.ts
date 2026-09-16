export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isR2Configured } from "@/lib/r2/client";
import { buildPersonalDocumentKey, uploadPersonalDocumentObject } from "@/lib/r2/personal-documents";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

/** POST: adds a new renewal (e.g. next year's licence) to an EXISTING
 * personal document. Uploading here also implicitly "updates" the
 * document for reminder purposes — whichever version now has the latest
 * expiryDate becomes the active one, so the reminder cadence
 * (src/lib/documents/personal-lifecycle.ts) re-evaluates against it and
 * naturally stops nagging about the old, now-superseded expiry. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(session?.user as any)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isR2Configured()) {
        return NextResponse.json({ error: "Cloudflare R2 nu este configurat încă." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await db.personalDocument.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file");
        const issueDate = (formData.get("issueDate") as string) || null;
        const expiryDate = (formData.get("expiryDate") as string) || null;

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Niciun fișier primit." }, { status: 400 });
        }
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json({ error: `Tip de fișier neacceptat: ${file.type}` }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: "Fișierul depășește 20MB." }, { status: 400 });
        }

        const versionId = randomUUID();
        const key = buildPersonalDocumentKey({ userId, personalDocumentId: id, versionId, mimeType: file.type });
        const buffer = Buffer.from(await file.arrayBuffer());
        await uploadPersonalDocumentObject(key, buffer, file.type);

        const version = await db.personalDocumentVersion.create({
            data: {
                id: versionId,
                personalDocumentId: id,
                issueDate: issueDate ? new Date(issueDate) : null,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                objectKey: key,
                originalMimeType: file.type,
                fileSize: file.size,
            },
        });

        // Reset the reminder clock — a fresh version means the cadence
        // should re-evaluate from scratch against whichever expiry is now
        // active, not skip today just because an old version's reminder
        // already went out earlier today.
        await db.personalDocument.update({ where: { id }, data: { lastReminderSentAt: null } });

        revalidatePath("/personal-documents");
        return NextResponse.json({ version });
    } catch (err: any) {
        console.error("Personal document version upload failed", err);
        return NextResponse.json({ error: err.message || "Upload eșuat." }, { status: 500 });
    }
}
