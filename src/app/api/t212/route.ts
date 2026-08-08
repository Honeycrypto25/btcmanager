export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getT212ConnectionStatus } from "@/lib/t212-sync";

/**
 * GET: status conexiune Trading212. Credențialele (T212_API_KEY / T212_API_SECRET)
 * se setează direct în Vercel, nu prin această aplicație — deci nu există
 * POST/DELETE aici, doar citire de status.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const status = await getT212ConnectionStatus();
    return NextResponse.json(status);
}
