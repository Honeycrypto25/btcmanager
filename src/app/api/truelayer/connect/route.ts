export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAuthUrl, CANONICAL_REDIRECT_URI } from "@/lib/bank/truelayer";
import crypto from "crypto";

/** Step 1 of the TrueLayer connect flow: admin clicks "Connect bank" on
 * /self-employed/bank, which links here. We stash a random CSRF state in a
 * short-lived cookie and hand off to TrueLayer's hosted bank-picker; the
 * callback route below verifies the state matches before doing anything. */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const user = session?.user as { isAdmin?: boolean } | undefined;
    if (!session || !user?.isAdmin) {
        return NextResponse.redirect(new URL("/auth/signin", req.url));
    }

    const state = crypto.randomBytes(24).toString("hex");
    const res = NextResponse.redirect(buildAuthUrl(state, CANONICAL_REDIRECT_URI));
    res.cookies.set("tl_oauth_state", state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 600, // 10 minutes — plenty for the bank-picker + login flow
        path: "/",
    });
    return res;
}
