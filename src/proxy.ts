import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { verify2faCookie, COOKIE_NAME, verifyTrustedDeviceCookie, TRUSTED_DEVICE_COOKIE } from "@/lib/cookie-sign";

export default withAuth(
    async function proxy(req) {
        const token = req.nextauth.token;
        const isAuth = !!token;
        const isAuthPage = req.nextUrl.pathname.startsWith("/auth");
        const isTotpPage = req.nextUrl.pathname === "/auth/totp";

        // 1. If user is on an auth page (signin, etc.) and is already logged in, redirect to home
        if (isAuthPage && isAuth && !isTotpPage) {
            return NextResponse.redirect(new URL("/", req.url));
        }

        // 2. If user is logged in, check if 2FA is required and verified
        if (isAuth && !isAuthPage) {
            const requires2fa = (token as any).requires2fa;
            const userId = (token as any).id as string | undefined;
            const rawCookie = req.cookies.get(COOKIE_NAME)?.value;

            // Verifică semnătura HMAC — un string simplu "true" nu mai este acceptat
            const verifiedUserId = rawCookie ? await verify2faCookie(rawCookie) : null;
            const is2faVerified = !!verifiedUserId && verifiedUserId === userId;

            if (requires2fa && !is2faVerified) {
                // "Safe device" fast path — an edge-safe signature+expiry check
                // only (no DB call from middleware). Revoking a device from
                // Admin stops it going forward but doesn't retroactively kick
                // an already-issued cookie mid-flight — same tradeoff the
                // 24h 2fa_verified cookie above already has.
                const deviceCookie = req.cookies.get(TRUSTED_DEVICE_COOKIE)?.value;
                const trusted = deviceCookie ? await verifyTrustedDeviceCookie(deviceCookie) : null;
                const isTrustedDevice = !!trusted && trusted.userId === userId;

                if (!isTrustedDevice) {
                    return NextResponse.redirect(new URL("/auth/totp", req.url));
                }
            }
        }

        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ token, req }) => {
                // Protect all routes except auth pages
                const isAuthPage = req.nextUrl.pathname.startsWith("/auth");
                if (isAuthPage) return true;
                return !!token;
            },
        },
    }
);

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest).*)",
    ],
};
