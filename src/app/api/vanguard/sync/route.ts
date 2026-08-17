export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncVanguardPrices } from "@/lib/vanguard-price-sync";

/** POST: manually trigger a Vanguard price sync (ETF ticker / OEIC ISIN holdings only) */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await syncVanguardPrices();

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json(result);
}
