import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "./db";
import crypto from "crypto";

function hashOtp(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
}

function getAdminEmails(): string[] {
    return process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()).filter(Boolean) || [];
}

/**
 * Resolves whether an email may log in at all, and with what access.
 * Admin (ADMIN_EMAILS env var) always wins and gets full access. Otherwise
 * checks the ViewerAccess table (managed from /admin) for a read-only,
 * per-section grant — this is how the wife/friends flow works, without
 * needing a redeploy or env var change for every person added.
 */
async function resolveAccess(email: string): Promise<{ allowed: boolean; isAdmin: boolean; allowedSections: string[] }> {
    const normalized = email.toLowerCase();
    if (getAdminEmails().includes(normalized)) {
        return { allowed: true, isAdmin: true, allowedSections: [] };
    }
    const viewer = await db.viewerAccess.findUnique({ where: { email: normalized } });
    if (viewer) {
        return { allowed: true, isAdmin: false, allowedSections: viewer.sections };
    }
    return { allowed: false, isAdmin: false, allowedSections: [] };
}

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(db),
    secret: process.env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 zile
    },
    providers: [
        CredentialsProvider({
            id: "otp",
            name: "OTP",
            credentials: {
                email: { label: "Email", type: "email" },
                code: { label: "Code", type: "text" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.code) {
                    throw new Error("Missing credentials");
                }

                const normalizedEmail = credentials.email.toLowerCase();
                const user = await db.user.findUnique({
                    where: { email: normalizedEmail },
                });

                if (!user) {
                    throw new Error("User not found");
                }

                // Check whitelist (admin or granted viewer)
                const access = await resolveAccess(user.email!);
                if (!access.allowed) {
                    throw new Error("AccessDenied");
                }

                // Verify OTP — comparăm hash-uri pentru a nu expune OTP-ul plaintext
                if (
                    !user.loginOtp ||
                    !user.loginOtpExpires ||
                    new Date() > user.loginOtpExpires ||
                    user.loginOtp !== hashOtp(credentials.code)
                ) {
                    throw new Error("Invalid or expired code");
                }

                // Clear OTP after successful login
                await db.user.update({
                    where: { id: user.id },
                    data: {
                        loginOtp: null,
                        loginOtpExpires: null,
                    },
                });

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    role: user.role,
                    twoFactorEnabled: user.twoFactorEnabled,
                    isAdmin: access.isAdmin,
                    allowedSections: access.allowedSections,
                };
            },
        }),
    ],
    callbacks: {
        async signIn({ user }) {
            if (!user.email) return false;

            const access = await resolveAccess(user.email);
            return access.allowed;
        },
        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
                token.requires2fa = (user as any).twoFactorEnabled;
                token.isAdmin = (user as any).isAdmin;
                token.allowedSections = (user as any).allowedSections;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token) {
                (session.user as any).id = token.id;
                (session.user as any).role = token.role;
                // Check if 2FA is enabled and if it has been verified for this session
                (session.user as any).requires2fa = token.requires2fa;
                (session.user as any).isAdmin = token.isAdmin;
                (session.user as any).allowedSections = token.allowedSections;
            }
            return session;
        },
    },
    pages: {
        signIn: "/auth/signin",
        verifyRequest: "/auth/verify-request",
        error: "/auth/error",
    },
};
