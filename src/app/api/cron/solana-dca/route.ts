export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runSolanaDcaForAllUsers } from "@/lib/solana/dca";

/**
 * Runs once a day (see vercel.json) — Vercel's Hobby plan rejects cron
 * schedules that fire more than once/day, so this is the finest interval
 * available without upgrading to Pro. Practical effect: `intervalHours`
 * in the UI should be left at 24 (or a multiple of it) on Hobby, since a
 * shorter interval is only actually checked once a day anyway. On a Pro
 * plan this could be tightened to hourly for finer-grained intervals.
 * No price polling happens here either way: the take-profit sell is a
 * Jupiter Trigger order that Jupiter's own infrastructure executes
 * independently once the price target is hit.
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
