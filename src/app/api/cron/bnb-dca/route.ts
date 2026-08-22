export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runBnbDcaForAllUsers } from "@/lib/bnb/dca";

/**
 * Runs once a day (see vercel.json) — same Hobby-plan constraint as
 * /api/cron/solana-dca. `intervalHours` in the UI should be left at 24 (or
 * a multiple of it) for the same reason. No price polling happens here:
 * the take-profit sell is a 1inch limit order that a resolver fills
 * independently once the price target is hit.
 *
 * runBnbDcaForAllUsers() also checks each user's monthly auto-sweep (send
 * WBNB above a configured minimum to a cold wallet) on every run — it has
 * its own "already swept this calendar month" gate.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await runBnbDcaForAllUsers();
    return NextResponse.json({ results });
}
