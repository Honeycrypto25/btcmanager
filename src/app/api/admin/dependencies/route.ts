export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDependencyStatus } from "@/lib/dependencies/check";

async function requireAdminSession() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    if (!(session.user as any).isAdmin) return null;
    return session;
}

/** GET: current vs. latest-on-npm version for every package.json dependency. */
export async function GET() {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await getDependencyStatus();
    return NextResponse.json(rows);
}
