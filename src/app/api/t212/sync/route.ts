export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncT212Account } from "@/lib/t212-sync";

/** POST: manually trigger a sync for the current user's Trading212 account */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id as string;

    const account = await db.t212Account.findFirst({ where: { userId } });
    if (!account) {
        return NextResponse.json({ error: "No Trading212 account connected" }, { status: 404 });
    }

    const result = await syncT212Account(account.id);

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true });
}
