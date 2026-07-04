export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/token";
import { Resend } from "resend";
import crypto from "crypto";

function hashOtp(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Rate limiting: max 3 cereri per email la fiecare 10 minute, max 1 la fiecare 60 secunde
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MINUTES = 10;

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

        // 2. Rate limiting bazat pe DB
        if (user.loginOtpExpires) {
            // Cooldown: blochează dacă ultimul OTP a fost trimis acum mai puțin de 60 secunde
            const otpCreatedAt = new Date(user.loginOtpExpires.getTime() - 15 * 60 * 1000);
            const secondsSinceLast = (Date.now() - otpCreatedAt.getTime()) / 1000;
            if (secondsSinceLast < OTP_COOLDOWN_SECONDS) {
                const retryAfter = Math.ceil(OTP_COOLDOWN_SECONDS - secondsSinceLast);
                return NextResponse.json(
                    { error: `Please wait ${retryAfter} seconds before requesting a new code.` },
                    { status: 429 }
                );
            }
        }

        // Window: max 3 OTP-uri în 10 minute (verificăm prin otpAttempts)
        const windowStart = new Date(Date.now() - OTP_WINDOW_MINUTES * 60 * 1000);
        if (
            user.otpWindowStart &&
            user.otpWindowStart > windowStart &&
            (user.otpAttempts ?? 0) >= OTP_MAX_PER_WINDOW
        ) {
            return NextResponse.json(
                { error: "Too many code requests. Please try again in 10 minutes." },
                { status: 429 }
            );
        }

        // Resetează fereastra dacă a expirat
        const newWindowStart = (!user.otpWindowStart || user.otpWindowStart <= windowStart)
            ? new Date()
            : user.otpWindowStart;
        const newAttempts = (!user.otpWindowStart || user.otpWindowStart <= windowStart)
            ? 1
            : (user.otpAttempts ?? 0) + 1;

        // 3. Generate OTP
        const otp = generateToken(6);
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // 4. Save to DB — stocăm hash-ul SHA-256, nu OTP-ul în clar
        await db.user.update({
            where: { id: user.id },
            data: {
                loginOtp: hashOtp(otp),
                loginOtpExpires: expires,
                otpAttempts: newAttempts,
                otpWindowStart: newWindowStart,
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
