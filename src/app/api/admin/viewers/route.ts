export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSectionKey } from "@/lib/permissions";

async function requireAdminSession() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    if (!(session.user as any).isAdmin) return null;
    return session;
}

/** GET: list every viewer (email + label + allowed sections) */
export async function GET() {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const viewers = await db.viewerAccess.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json(viewers);
}

/** POST: create or update a viewer's email/label/sections (upsert by email) */
export async function POST(req: NextRequest) {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
    const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : null;
    const sections = Array.isArray(body?.sections) ? body.sections.filter((s: unknown) => typeof s === "string" && isSectionKey(s)) : [];

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Adresă de email invalidă" }, { status: 400 });
    }
    if (sections.length === 0) {
        return NextResponse.json({ error: "Bifează cel puțin o secțiune" }, { status: 400 });
    }

    const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
    if (adminEmails.includes(email)) {
        return NextResponse.json({ error: "Acest email e deja adminul contului" }, { status: 400 });
    }

    const viewer = await db.viewerAccess.upsert({
        where: { email },
        update: { label, sections },
        create: { email, label, sections },
    });

    return NextResponse.json(viewer);
}

/** DELETE: revoke a viewer entirely (?id=...) */
export async function DELETE(req: NextRequest) {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await db.viewerAccess.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ success: true });
}
