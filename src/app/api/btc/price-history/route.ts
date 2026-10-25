export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBtcDailyPrices } from "@/lib/btc-price-history";

/**
 * GET /api/btc/price-history?days=N
 *
 * Daily BTC/USD closes for the last N days, served from our own cache
 * (see lib/btc-price-history.ts). Response keeps CoinGecko's
 * `prices: [[ms, price], ...]` shape so the chart components only had to
 * change their URL.
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const daysParam = new URL(req.url).searchParams.get("days");
    const days = Number(daysParam);
    if (!Number.isFinite(days) || days <= 0) {
        return NextResponse.json({ error: "Parametrul days trebuie să fie un număr pozitiv." }, { status: 400 });
    }

    try {
        const { prices, stale } = await getBtcDailyPrices(days);
        if (prices.length === 0) {
            return NextResponse.json({ error: "Nicio sursă de preț BTC nu a răspuns." }, { status: 502 });
        }
        return NextResponse.json(
            { prices: prices.map((p) => [p.time, p.price]), stale },
            { headers: { "Cache-Control": "private, max-age=300" } }
        );
    } catch (err) {
        console.error("[api/btc/price-history]", err);
        return NextResponse.json({ error: "Eroare la încărcarea istoricului de preț." }, { status: 500 });
    }
}
