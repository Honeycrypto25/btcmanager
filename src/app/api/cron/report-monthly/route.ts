export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sendMonthlyReport } from "@/lib/email/send-report";

/**
 * Apelat automat de Vercel Cron (vezi vercel.json) în prima zi a fiecărei luni.
 * Protejat prin CRON_SECRET, la fel ca sincronizarea T212.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sendMonthlyReport();

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true });
}
