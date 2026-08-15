export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSignedReceiptUrl } from "@/lib/r2/receipts";

/** GET: returns a short-lived signed R2 URL for the receipt's original (or preview) object.
 * Never expose R2 credentials or public bucket URLs — this is the only authenticated way to view a receipt image. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.userId !== userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Default to the browser-viewable preview when one exists (e.g. HEIC
    // originals aren't renderable by <img> in any mainstream browser).
    // Pass ?variant=original to force the raw original file instead.
    const variant = new URL(req.url).searchParams.get("variant");
    const key = variant !== "original" && receipt.previewObjectKey ? receipt.previewObjectKey : receipt.originalObjectKey;

    try {
        const url = await getSignedReceiptUrl(key);
        return NextResponse.json({ url });
    } catch (err: any) {
        console.error("Failed to sign receipt URL", err);
        return NextResponse.json({ error: err.message || "Nu s-a putut genera link-ul." }, { status: 500 });
    }
}
