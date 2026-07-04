import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// CRITICAL: without this, Next.js can treat this route as static/cacheable,
// which breaks CSRF tokens, session checks, and sign-in entirely — every
// request would get served a stale cached response instead of running
// NextAuth's per-request logic.
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
