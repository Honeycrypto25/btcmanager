export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { getLendPositions } from "@/lib/solana/jupiter-lend";
import { recordLendSnapshots } from "@/lib/solana/lend-snapshots";
import { lendCapLtv } from "@/lib/solana/lend-config";
import { checkLendAlerts } from "@/lib/email/lend-alert";
import { snapshotAlchemyUsage } from "@/lib/api-usage-report";
import { refreshDailyPrices } from "@/lib/price-history";
import { expirePageCache } from "@/lib/page-cache";

/**
 * Daily (Hobby-plan cron limit, see vercel.json): records the Jupiter Lend
 * position's rates/balances so the Împrumuturi page can chart the position's own
 * APY spread. The page also records on open (throttled), so this just guarantees
 * at least one point a day even when nobody visits.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Runs after all the bot crons: store yesterday's + today's Alchemy usage (the free plan only returns the last days).
    await snapshotAlchemyUsage().catch((err) => console.error("snapshotAlchemyUsage failed", err));
    // The daily price check: closes yesterday (09:50 UTC) and re-checks the last 3 closed days, logging corrections.
    await refreshDailyPrices("SOL", undefined, Date.now(), true).catch((err) => console.error("refreshDailyPrices failed", err));

    const lend = await getLendPositions();
    if (lend.error) return NextResponse.json({ ok: false, error: lend.error });
    await recordLendSnapshots(lend.positions);
    const alert = await checkLendAlerts(lend.positions, lendCapLtv());
    expirePageCache(); // new bot/sync data → cached pages rebuild on their next view
    return NextResponse.json({ ok: true, positions: lend.positions.length, alert });
}
