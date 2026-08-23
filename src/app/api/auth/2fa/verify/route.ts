export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyTotpToken } from "@/lib/totp";
import { cookies } from "next/headers";
import { sign2faCookie, COOKIE_NAME } from "@/lib/cookie-sign";
import { createTrustedDevice, TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_MAX_AGE_SECONDS } from "@/lib/trusted-device";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(session.user as any).isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
        const { token, trustDevice } = await req.json();
        if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, twoFactorSecret: true, twoFactorEnabled: true }
        });

        if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
            return NextResponse.json({ error: "2FA not enabled for this account" }, { status: 400 });
        }

        const isValid = await verifyTotpToken(token, user.twoFactorSecret);
        if (!isValid) return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });

        // Cookie semnat HMAC-SHA256 cu userId + timestamp — nu poate fi falsificat
        const cookieStore = await cookies();
        cookieStore.set(COOKIE_NAME, await sign2faCookie(user.id), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24, // 24 ore
            path: '/'
        });

        // "Trust this device" — only ever set here, after a FULL verified
        // login (OTP + TOTP), so a compromised email alone can never grant
        // lasting trust. Once set, this same cookie also lets future logins
        // skip the emailed OTP code entirely (src/lib/auth.ts authorize()).
        if (trustDevice) {
            const userAgent = req.headers.get('user-agent');
            const deviceCookieValue = await createTrustedDevice(user.id, userAgent);
            cookieStore.set(TRUSTED_DEVICE_COOKIE, deviceCookieValue, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
                path: '/'
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}
