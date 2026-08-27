export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { syncAllTrueLayerConnections } from "@/lib/bank/truelayer-sync";

/**
 * Apelat automat de Vercel Cron (vezi vercel.json) o dată la 24h.
 * Protejat prin CRON_SECRET — Vercel adaugă automat header-ul
 * "Authorization: Bearer <CRON_SECRET>" la apelurile cron proprii.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await syncAllTrueLayerConnections();

    return NextResponse.json(result);
}
