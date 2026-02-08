import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    async function middleware(req) {
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
            const is2faVerified = req.cookies.get("2fa_verified")?.value === "true";

            if (requires2fa && !is2faVerified) {
                return NextResponse.redirect(new URL("/auth/totp", req.url));
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
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
