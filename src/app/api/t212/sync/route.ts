export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncT212Account } from "@/lib/t212-sync";

/** POST: manually trigger a Trading212 sync (credentials come from env vars) */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(session.user as any).isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const result = await syncT212Account();

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true });
}
