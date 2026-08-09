export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendWeeklyReport, sendMonthlyReport } from "@/lib/email/send-report";

/** GET: status configurare rapoarte (fără să expunem cheia API) */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const configured = !!process.env.RESEND_API_KEY && !!process.env.REPORT_EMAIL_TO;
    const to = process.env.REPORT_EMAIL_TO ?? null;

    return NextResponse.json({
        configured,
        hasApiKey: !!process.env.RESEND_API_KEY,
        recipient: to,
    });
}

/** POST: trimite manual un raport de test (weekly sau monthly) — util ca să vezi cum arată fără să aștepți programarea automată. */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { type } = await req.json().catch(() => ({ type: null }));
    if (type !== "weekly" && type !== "monthly") {
        return NextResponse.json({ error: "type must be 'weekly' or 'monthly'" }, { status: 400 });
    }

    const result = type === "weekly" ? await sendWeeklyReport() : await sendMonthlyReport();

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true });
}
