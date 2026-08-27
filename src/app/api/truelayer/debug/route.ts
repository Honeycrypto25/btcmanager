export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/bank/truelayer";
import crypto from "crypto";

/** Temporary diagnostic route — shows the exact redirect_uri / auth URL
 * this deployment would send, without actually redirecting, so a mismatch
 * against the TrueLayer Console allow-list can be spotted directly. Remove
 * once the "Invalid redirect_uri" issue is confirmed fixed. */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const user = session?.user as { isAdmin?: boolean } | undefined;
    if (!session || !user?.isAdmin) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const redirectUri = new URL("/api/truelayer/callback", req.url).toString();
    const state = crypto.randomBytes(8).toString("hex");
    let authUrl: string;
    let buildError: string | null = null;
    try {
        authUrl = buildAuthUrl(state, redirectUri);
    } catch (err) {
        authUrl = "";
        buildError = err instanceof Error ? err.message : String(err);
    }
    return NextResponse.json({
        reqUrl: req.url,
        redirectUri,
        authUrl,
        buildError,
        hasClientId: !!process.env.TRUELAYER_CLIENT_ID,
        hasClientSecret: !!process.env.TRUELAYER_CLIENT_SECRET,
    });
}
