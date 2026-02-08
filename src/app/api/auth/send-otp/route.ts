import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/token";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase();

        // 1. Check if user exists (or is authorized admin)
        const adminEmails = process.env.ADMIN_EMAILS?.split(",").map((e: any) => e.trim().toLowerCase()) || [];
        const isWhitelisted = adminEmails.includes(normalizedEmail);

        let user = await db.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!isWhitelisted && !user) {
            return NextResponse.json({ error: "Access Denied" }, { status: 403 });
        }

        if (!user) {
            user = await db.user.create({
                data: {
                    email: normalizedEmail,
                    role: "USER",
                }
            });
        }

        // 2. Generate OTP
        const otp = generateToken(6);
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // 3. Save to DB
        await db.user.update({
            where: { id: user.id },
            data: {
                loginOtp: otp,
                loginOtpExpires: expires,
            },
        });

        // 4. Send Email via Resend
        await resend.emails.send({
            from: process.env.EMAIL_FROM || "onboarding@resend.dev",
            to: normalizedEmail,
            subject: "Your Login Code - BTC Manager",
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Login Verification</h2>
                    <p>Enter the following code to sign in to BTC Manager:</p>
                    <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; font-size: 24px; letter-spacing: 5px; font-weight: bold;">
                        ${otp}
                    </div>
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">This code expires in 15 minutes. If you didn't request this, please ignore this email.</p>
                </div>
            `,
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("OTP Error:", error);
        return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
    }
}
