export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { exchangeCodeForToken, fetchAccounts } from "@/lib/bank/truelayer";

const RETURN_PATH = "/self-employed/bank";

/** Step 2 of the TrueLayer connect flow — TrueLayer redirects the user's
 * browser back here after they pick a bank and log in. */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; isAdmin?: boolean } | undefined;
    if (!session || !user?.isAdmin || !user.id) {
        return NextResponse.redirect(new URL("/auth/signin", req.url));
    }

    const url = new URL(req.url);
    const error = url.searchParams.get("error");
    if (error) {
        return NextResponse.redirect(new URL(`${RETURN_PATH}?bankConnectError=${encodeURIComponent(error)}`, req.url));
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = req.cookies.get("tl_oauth_state")?.value;

    if (!code || !state || !expectedState || state !== expectedState) {
        return NextResponse.redirect(new URL(`${RETURN_PATH}?bankConnectError=invalid_state`, req.url));
    }

    try {
        const redirectUri = new URL("/api/truelayer/callback", req.url).toString();
        const token = await exchangeCodeForToken(code, redirectUri);
        const accounts = await fetchAccounts(token.access_token);
        const providerBankName = accounts[0]?.provider?.display_name ?? null;

        await db.bankConnection.create({
            data: {
                userId: user.id,
                provider: "truelayer",
                providerBankName,
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
            },
        });

        const res = NextResponse.redirect(new URL(`${RETURN_PATH}?bankConnected=1`, req.url));
        res.cookies.delete("tl_oauth_state");
        return res;
    } catch (err) {
        console.error("TrueLayer callback failed", err);
        return NextResponse.redirect(new URL(`${RETURN_PATH}?bankConnectError=exchange_failed`, req.url));
    }
}
