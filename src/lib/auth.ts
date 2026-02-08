import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "./db";

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(db),
    session: {
        strategy: "jwt",
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

                const user = await db.user.findUnique({
                    where: { email: credentials.email.toLowerCase() },
                });

                if (!user) {
                    throw new Error("User not found");
                }

                // Check Admin whitelist
                const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
                const isAllowed = adminEmails.includes(user.email!.toLowerCase());

                if (!isAllowed) {
                    throw new Error("AccessDenied");
                }

                // Verify OTP
                if (
                    !user.loginOtp ||
                    !user.loginOtpExpires ||
                    new Date() > user.loginOtpExpires ||
                    user.loginOtp !== credentials.code
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
                };
            },
        }),
    ],
    callbacks: {
        async signIn({ user }) {
            if (!user.email) return false;

            const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
            const isAllowed = adminEmails.includes(user.email.toLowerCase());

            return isAllowed;
        },
        async jwt({ token, user, trigger, session }) {
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
