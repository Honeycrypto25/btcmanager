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

        // 1. Check if user exists (or is authorized admin / granted viewer)
        const adminEmails = process.env.ADMIN_EMAILS?.split(",").map((e: any) => e.trim().toLowerCase()) || [];
        const isAdmin = adminEmails.includes(normalizedEmail);

        let user = await db.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!isAdmin && !user) {
            // Not a known user yet and not the admin — only still allowed if
            // this email has been granted read-only viewer access from /admin.
            const viewer = await db.viewerAccess.findUnique({ where: { email: normalizedEmail } });
            if (!viewer) {
                return NextResponse.json({ error: "Access Denied" }, { status: 403 });
            }
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
            from: process.env.EMAIL_FROM || "Personal Dashboard <login@evama.net>",
            to: normalizedEmail,
            subject: `${otp} — your Personal Dashboard login code`,
            html: `
                <div style="background:#0a0a09; padding:40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                    <div style="max-width:440px; margin:0 auto;">
                        <div style="text-align:center; margin-bottom:28px;">
                            <span style="display:inline-flex; align-items:center; gap:8px; color:#8a8f98; font-size:11px; font-weight:600; letter-spacing:0.2em; text-transform:uppercase;">
                                Personal Dashboard
                            </span>
                        </div>
                        <div style="background:#141311; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:36px 32px;">
                            <p style="margin:0 0 4px; color:#8a8f98; font-size:11px; font-weight:600; letter-spacing:0.15em; text-transform:uppercase;">Login verification</p>
                            <h1 style="margin:0 0 20px; color:#f0eee6; font-size:20px; font-weight:500;">Your sign-in code</h1>
                            <div style="background:rgba(214,162,76,0.08); border:1px solid rgba(214,162,76,0.24); border-radius:12px; padding:20px; text-align:center;">
                                <span style="font-family: 'SF Mono', Consolas, monospace; font-size:32px; font-weight:600; letter-spacing:0.35em; color:#e8bc70;">${otp}</span>
                            </div>
                            <p style="margin:20px 0 0; color:#a9a79c; font-size:13px; line-height:1.6;">
                                This code expires in 15 minutes. Enter it on the sign-in screen to access your portfolio.
                            </p>
                        </div>
                        <p style="margin:24px 0 0; color:#57554c; font-size:12px; line-height:1.6; text-align:center;">
                            Didn't request this? You can safely ignore this email — no one can sign in without this code.
                        </p>
                    </div>
                </div>
            `,
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("OTP Error:", error);
        return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
    }
}
