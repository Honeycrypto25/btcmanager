export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runEvaDcaForAllUsers } from "@/lib/solana/eva-dca";

/**
 * Runs once a day (see vercel.json) — same Hobby-plan cron constraint as
 * the other chain modules (see the equivalent comment in
 * src/app/api/cron/solana-dca/route.ts). No price polling happens here
 * either: the take-profit sell is a Jupiter Trigger order that Jupiter's
 * own infrastructure executes independently once the price target is hit.
 *
 * runEvaDcaForAllUsers() also checks each user's monthly auto-sweep (send
 * EVA above a configured minimum to the same SOLANA_SWEEP_DESTINATION cold
 * wallet used by the SOL module) on every run — it has its own "already
 * swept this calendar month" gate, so running this daily doesn't sweep
 * daily.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await runEvaDcaForAllUsers();
    return NextResponse.json({ results });
}
