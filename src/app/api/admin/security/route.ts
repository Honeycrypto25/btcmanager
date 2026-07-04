export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateTotpSecret, generateQrCodeUrl, verifyTotpToken } from "@/lib/totp";

/** GET: Fetch current user's 2FA status or generate a new secret for setup */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({
        where: { email: session.user.email },
        select: { twoFactorEnabled: true, twoFactorSecret: true }
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'setup') {
        if (user.twoFactorEnabled) return NextResponse.json({ error: "2FA already enabled" }, { status: 400 });

        const secret = generateTotpSecret();
        const qrCodeUrl = await generateQrCodeUrl(session.user.email, secret);

        // Salvăm secretul temporar pe server — POST-ul de verificare NU va accepta niciun secret trimis de client
        await db.user.update({
            where: { email: session.user.email },
            data: { pendingTotpSecret: secret }
        });

        return NextResponse.json({ secret, qrCodeUrl });
    }

    return NextResponse.json({ enabled: user.twoFactorEnabled });
}

/** POST: Verify and enable 2FA */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { token } = await req.json();
        if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

        // Citim secretul din DB — nu din request (previne injectarea unui secret extern)
        const user = await db.user.findUnique({
            where: { email: session.user.email },
            select: { pendingTotpSecret: true, twoFactorEnabled: true }
        });

        if (!user?.pendingTotpSecret) {
            return NextResponse.json({ error: "No pending 2FA setup. Start setup again." }, { status: 400 });
        }
        if (user.twoFactorEnabled) {
            return NextResponse.json({ error: "2FA already enabled" }, { status: 400 });
        }

        const isValid = await verifyTotpToken(token, user.pendingTotpSecret);
        if (!isValid) return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });

        // Activăm 2FA și ștergem secretul temporar
        await db.user.update({
            where: { email: session.user.email },
            data: {
                twoFactorSecret: user.pendingTotpSecret,
                twoFactorEnabled: true,
                pendingTotpSecret: null
            }
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to enable 2FA" }, { status: 500 });
    }
}

/** DELETE: Disable 2FA (requires current token for security) */
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { token } = await req.json();
        const user = await db.user.findUnique({
            where: { email: session.user.email },
            select: { twoFactorSecret: true }
        });

        if (!user?.twoFactorSecret) return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });

        const isValid = await verifyTotpToken(token, user.twoFactorSecret);
        if (!isValid) return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });

        await db.user.update({
            where: { email: session.user.email },
            data: {
                twoFactorSecret: null,
                twoFactorEnabled: false
            }
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to disable 2FA" }, { status: 500 });
    }
}
