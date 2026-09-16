export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isR2Configured } from "@/lib/r2/client";
import { buildPersonalDocumentKey, uploadPersonalDocumentObject } from "@/lib/r2/personal-documents";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

function unauthorized() {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** POST: creates a brand new personal document (a new "series", e.g.
 * "Licență Taxi — Sergiu") together with its first version/file. Adding a
 * later renewal to an existing document goes through
 * /api/personal-documents/[id]/versions instead. */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return unauthorized();
    if (!(session?.user as any)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isR2Configured()) {
        return NextResponse.json(
            { error: "Cloudflare R2 nu este configurat încă. Adaugă R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME în variabilele de mediu." },
            { status: 503 }
        );
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file");
        const person = ((formData.get("person") as string) || "").trim();
        const title = ((formData.get("title") as string) || "").trim();
        const category = (formData.get("category") as string) || "Altele";
        const issueDate = (formData.get("issueDate") as string) || null;
        const expiryDate = (formData.get("expiryDate") as string) || null;
        const notes = (formData.get("notes") as string) || null;

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Niciun fișier primit." }, { status: 400 });
        }
        if (!person) return NextResponse.json({ error: "Numele persoanei este obligatoriu." }, { status: 400 });
        if (!title) return NextResponse.json({ error: "Titlul documentului este obligatoriu." }, { status: 400 });
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json({ error: `Tip de fișier neacceptat: ${file.type}` }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: "Fișierul depășește 20MB." }, { status: 400 });
        }

        const documentId = randomUUID();
        const versionId = randomUUID();
        const key = buildPersonalDocumentKey({ userId, personalDocumentId: documentId, versionId, mimeType: file.type });
        const buffer = Buffer.from(await file.arrayBuffer());
        await uploadPersonalDocumentObject(key, buffer, file.type);

        const document = await db.personalDocument.create({
            data: {
                id: documentId,
                userId,
                person,
                title,
                category,
                notes,
                versions: {
                    create: {
                        id: versionId,
                        issueDate: issueDate ? new Date(issueDate) : null,
                        expiryDate: expiryDate ? new Date(expiryDate) : null,
                        objectKey: key,
                        originalMimeType: file.type,
                        fileSize: file.size,
                    },
                },
            },
            include: { versions: true },
        });

        return NextResponse.json({ document });
    } catch (err: any) {
        console.error("Personal document upload failed", err);
        return NextResponse.json({ error: err.message || "Upload eșuat." }, { status: 500 });
    }
}
