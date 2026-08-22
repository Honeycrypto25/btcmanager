import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Kept in sync by hand with SECTION_KEYS in src/lib/permissions.ts — this
// file runs on the Edge runtime and can't import that module (it pulls in
// the Prisma-backed authOptions, which isn't Edge-compatible). Route
// prefix -> section this page belongs to. Anything not listed here that
// isn't explicitly public is treated as admin-only.
const SECTION_ROUTES: { prefix: string; section: string }[] = [
    { prefix: "/btc", section: "btc" },
    { prefix: "/t212", section: "t212" },
    { prefix: "/investments", section: "investments" },
    { prefix: "/vanguard", section: "investments" },
    { prefix: "/goals", section: "investments" },
    { prefix: "/solana", section: "solana" },
    { prefix: "/base", section: "base" },
    { prefix: "/self-employed", section: "selfEmployed" },
    { prefix: "/vehicles", section: "vehicles" },
    { prefix: "/documents", section: "vehicles" },
    { prefix: "/reminders", section: "vehicles" },
];

const SECTION_HOME: Record<string, string> = {
    btc: "/btc",
    t212: "/t212",
    investments: "/investments",
    solana: "/solana",
    base: "/base",
    selfEmployed: "/self-employed",
    vehicles: "/vehicles",
};

const PUBLIC_PREFIXES = ["/auth", "/api/auth", "/offline", "/_next", "/manifest.webmanifest", "/favicon.ico", "/sw.js", "/icons"];

function sectionForPath(pathname: string): string | null {
    const match = SECTION_ROUTES.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
    return match?.section ?? null;
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"))) {
        return NextResponse.next();
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
        const signInUrl = new URL("/auth/signin", req.url);
        return NextResponse.redirect(signInUrl);
    }

    const isAdmin = Boolean((token as any).isAdmin);
    if (isAdmin) return NextResponse.next();

    // Non-admin (viewer): only API routes under /api/auth are ever exempted
    // above — every other /api/* mutating route enforces requireAdmin() at
    // the handler level already (defense in depth), so middleware only
    // needs to gate actual pages here.
    if (pathname.startsWith("/api/")) return NextResponse.next();

    const allowedSections: string[] = Array.isArray((token as any).allowedSections) ? (token as any).allowedSections : [];
    const section = sectionForPath(pathname);

    // "/" (Overview), "/tasks" and "/admin" aggregate everything or are
    // admin-only settings — never shown to a viewer, whatever their
    // sections are.
    if (section === null) {
        const fallback = allowedSections.find(s => SECTION_HOME[s]);
        const dest = fallback ? SECTION_HOME[fallback] : "/no-access";
        if (pathname !== dest) return NextResponse.redirect(new URL(dest, req.url));
        return NextResponse.next();
    }

    if (!allowedSections.includes(section)) {
        const fallback = allowedSections.find(s => SECTION_HOME[s]);
        const dest = fallback ? SECTION_HOME[fallback] : "/no-access";
        return NextResponse.redirect(new URL(dest, req.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)",
    ],
};
