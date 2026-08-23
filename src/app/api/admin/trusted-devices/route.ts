export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

async function requireAdminSession() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    if (!(session.user as any).isAdmin) return null;
    return session;
}

/** GET: list every trusted ("safe") device, across all users. */
export async function GET() {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const devices = await db.trustedDevice.findMany({
        orderBy: { lastUsedAt: "desc" },
        include: { user: { select: { email: true } } },
    });

    return NextResponse.json(devices.map((d) => ({
        id: d.id,
        email: d.user.email,
        label: d.label,
        userAgent: d.userAgent,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
    })));
}

/** DELETE: revoke a trusted device (?id=...) — next login from it needs a fresh OTP/TOTP. */
export async function DELETE(req: NextRequest) {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await db.trustedDevice.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ success: true });
}
