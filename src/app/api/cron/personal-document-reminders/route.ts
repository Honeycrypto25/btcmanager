export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sendPersonalDocumentReminders } from "@/lib/email/personal-document-reminders";

/**
 * Apelat automat de Vercel Cron (vezi vercel.json) o dată pe zi. Protejat
 * prin CRON_SECRET, la fel ca celelalte cron-uri.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sendPersonalDocumentReminders();

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, sent: result.sent, checked: result.checked });
}
