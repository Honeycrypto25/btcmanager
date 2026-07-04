import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "./db";
import crypto from "crypto";

function hashOtp(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
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

                console.log("[auth-debug] authorize: email=", normalizedEmail, "userFound=", !!user);

                if (!user) {
                    throw new Error("User not found");
                }

                // Check Admin whitelist
                const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
                const isAllowed = adminEmails.includes(user.email!.toLowerCase());

                console.log("[auth-debug] authorize: isAllowed=", isAllowed, "adminEmailsCount=", adminEmails.length);

                if (!isAllowed) {
                    throw new Error("AccessDenied");
                }

                // Verify OTP — comparăm hash-uri pentru a nu expune OTP-ul plaintext
                const codeHash = hashOtp(credentials.code);
                const hasOtp = !!user.loginOtp;
                const hasExpiry = !!user.loginOtpExpires;
                const notExpired = hasExpiry ? new Date() <= user.loginOtpExpires! : false;
                const hashMatches = user.loginOtp === codeHash;

                console.log(
                    "[auth-debug] authorize: hasOtp=", hasOtp,
                    "hasExpiry=", hasExpiry,
                    "notExpired=", notExpired,
                    "hashMatches=", hashMatches
                );

                if (!hasOtp || !hasExpiry || !notExpired || !hashMatches) {
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

                console.log("[auth-debug] authorize: SUCCESS, returning user id=", user.id);

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    role: user.role,
                    twoFactorEnabled: user.twoFactorEnabled,
                };
            },
        }),
    ],
    callbacks: {
        async signIn({ user }) {
            if (!user.email) return false;

            const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
            const isAllowed = adminEmails.includes(user.email.toLowerCase());

            console.log("[auth-debug] signIn callback: email=", user.email, "isAllowed=", isAllowed);

            return isAllowed;
        },
        async jwt({ token, user, trigger, session }) {
            console.log("[auth-debug] jwt callback: hasUser=", !!user, "trigger=", trigger, "tokenSubBefore=", token.sub);
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
                token.requires2fa = (user as any).twoFactorEnabled;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token) {
                (session.user as any).id = token.id;
                (session.user as any).role = token.role;
                // Check if 2FA is enabled and if it has been verified for this session
                (session.user as any).requires2fa = token.requires2fa;
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
