export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSignedDocumentUrl } from "@/lib/r2/documents";

/** GET: returns a short-lived signed R2 URL for a document's file. Never
 * exposes R2 credentials or a public bucket URL. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const document = await db.document.findUnique({ where: { id } });
    if (!document || document.userId !== userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
        const url = await getSignedDocumentUrl(document.objectKey);
        return NextResponse.json({ url });
    } catch (err: any) {
        console.error("Failed to sign document URL", err);
        return NextResponse.json({ error: err.message || "Nu s-a putut genera link-ul." }, { status: 500 });
    }
}
