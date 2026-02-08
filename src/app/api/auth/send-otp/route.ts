import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/token";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase();

        // 1. Check if user exists (or is authorized admin)
        // Access control: Only allow if email is in ADMIN_EMAILS or already exists in DB?
        // Logic: If user doesn't exist in DB, should we create them?
        // For this app ("private administrative dashboard"), we usually only want Pre-registered users or Admins.
        // Let's stick to: Must be in ADMIN_EMAILS whitelist OR existing user.

        const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
        const isWhitelisted = adminEmails.includes(normalizedEmail);

        let user = await db.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!isWhitelisted && !user) {
            return NextResponse.json({ error: "Access Denied" }, { status: 403 });
        }

        // If user doesn't exist but is whitelisted, create them? using upsert later or just let them be created.
        // PrismaAdapter creates users on sign in usually. CredentialsProvider doesn't automatically create users unless we do it.
        // So we should upsert the user here to ensure we can save the OTP.

        if (!user) {
            user = await db.user.create({
                data: {
                    email: normalizedEmail,
                    role: "USER", // Default, maybe promote to ADMIN if in whitelist?
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

        // 4. Send Email
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_SERVER_HOST,
            port: Number(process.env.EMAIL_SERVER_PORT),
            auth: {
                user: process.env.EMAIL_SERVER_USER,
                pass: process.env.EMAIL_SERVER_PASSWORD,
            },
            secure: false, // TLS? depends on config. usually port 587 is secure: false (STARTTLS)
        });

        // Parse connection string for params if EMAIL_SERVER var is used instead of individual vars
        // BUT user provided .env usually has EMAIL_SERVER=smtp://...
        // Let's try to parse process.env.EMAIL_SERVER if specific vars aren't there.
        // Actually, let's look at .env file to see what we have!
        // I'll assume standard nodemailer config for now, but better to check .env.

        // Wait, I shouldn't read .env directly if I can avoid it (privacy). 
        // `EmailProvider` used `process.env.EMAIL_SERVER`. I should parse that.

        let transportConfig: any = process.env.EMAIL_SERVER; // String connection string works with nodemailer!

        const mailer = nodemailer.createTransport(transportConfig);

        await mailer.sendMail({
            from: process.env.EMAIL_FROM,
            to: normalizedEmail,
            subject: "Your Login Code - BTC Manager",
            text: `Your login code is: ${otp}\n\nThis code expires in 15 minutes.`,
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
