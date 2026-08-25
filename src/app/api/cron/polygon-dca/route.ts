export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runPolygonReverseDcaForAllSettings } from "@/lib/polygon/reverse-dca";
import { runPolygonSweepForUser } from "@/lib/polygon/sweep";

/**
 * Runs once a day (see vercel.json) — same Hobby-plan constraint as the
 * other DCA crons. Unlike Solana/Base/BNB there's no buy-interval gate here:
 * runPolygonReverseDcaForAllSettings() checks every enabled token bot for
 * newly-arrived external balance on every pass and no-ops when there's
 * nothing new to sell.
 *
 * Sweep runs separately, once per distinct user with sweep enabled (not per
 * token-settings row — USDC is fungible across GEOD/MYST/etc., see
 * lib/polygon/sweep.ts) — it has its own "already swept this calendar
 * month" gate.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await runPolygonReverseDcaForAllSettings();

    const sweepRows = await db.polygonSweepSettings.findMany({ where: { enabled: true } });
    for (const row of sweepRows) {
        try {
            await runPolygonSweepForUser(row.userId);
        } catch (err) {
            console.error(`Polygon sweep failed for user ${row.userId}`, err);
        }
    }

    return NextResponse.json({ results });
}
