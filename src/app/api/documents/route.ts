export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isR2Configured } from "@/lib/r2/client";
import { buildDocumentKey, uploadDocumentObject } from "@/lib/r2/documents";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

function unauthorized() {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** POST: upload a document (insurance cert, MOT, warranty, ID, etc.) — creates
 * the object in R2 and a Document row. Category/title/vehicleId/dates are
 * editable afterwards via updateDocumentDetails. */
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
        const category = (formData.get("category") as string) || "Other";
        const title = (formData.get("title") as string) || (file instanceof File ? file.name : "Document");
        const vehicleId = (formData.get("vehicleId") as string) || null;

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Niciun fișier primit." }, { status: 400 });
        }
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json({ error: `Tip de fișier neacceptat: ${file.type}` }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: "Fișierul depășește 20MB." }, { status: 400 });
        }

        if (vehicleId) {
            const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
            if (!vehicle || vehicle.userId !== userId) {
                return NextResponse.json({ error: "Vehicul invalid." }, { status: 400 });
            }
        }

        const documentId = randomUUID();
        const key = buildDocumentKey({ userId, category, documentId, mimeType: file.type });
        const buffer = Buffer.from(await file.arrayBuffer());
        await uploadDocumentObject(key, buffer, file.type);

        const document = await db.document.create({
            data: {
                id: documentId,
                userId,
                category,
                title,
                vehicleId,
                objectKey: key,
                originalMimeType: file.type,
                fileSize: file.size,
            },
        });

        return NextResponse.json({ document });
    } catch (err: any) {
        console.error("Document upload failed", err);
        return NextResponse.json({ error: err.message || "Upload eșuat." }, { status: 500 });
    }
}
