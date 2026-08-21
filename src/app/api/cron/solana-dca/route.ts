export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runSolanaDcaForAllUsers } from "@/lib/solana/dca";

/**
 * Runs hourly (see vercel.json). Deliberately more frequent than any
 * realistic `intervalHours` setting — runSolanaDcaForUser() itself decides
 * whether a buy is actually due, so this just needs to run often enough
 * that the configured interval is respected without needing a matching
 * cron schedule per user. No price polling happens here: the take-profit
 * sell is a Jupiter Trigger order that Jupiter's own infrastructure
 * executes independently once the price target is hit.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await runSolanaDcaForAllUsers();
    return NextResponse.json({ results });
}
