import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyTotpToken } from "@/lib/totp";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { token } = await req.json();
        if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            select: { twoFactorSecret: true, twoFactorEnabled: true }
        });

        if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
            return NextResponse.json({ error: "2FA not enabled for this account" }, { status: 400 });
        }

        const isValid = await verifyTotpToken(token, user.twoFactorSecret);
        if (!isValid) return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });

        // Set a secure, HTTP-only cookie to track 2FA verification for this session
        // In a real production app, this should be a signed JWT or similar.
        const cookieStore = await cookies();
        cookieStore.set('2fa_verified', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24, // 24 hours
            path: '/'
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}
