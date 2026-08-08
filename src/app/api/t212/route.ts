export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptSecret, maskSecret } from "@/lib/crypto";
import { testConnection } from "@/lib/t212";
import { syncT212Account } from "@/lib/t212-sync";

/** GET: connection status for the current user's Trading212 account */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const account = await db.t212Account.findFirst({
        where: { userId: (session.user as any).id },
        orderBy: { createdAt: "desc" },
    });

    if (!account) {
        return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
        connected: true,
        environment: account.environment,
        currency: account.currency,
        lastSyncedAt: account.lastSyncedAt,
        lastSyncError: account.lastSyncError,
    });
}

/** POST: connect (or reconnect) a Trading212 account — tests credentials before saving */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { apiKey, apiSecret, environment } = await req.json();

        if (!apiKey || !apiSecret) {
            return NextResponse.json({ error: "Missing API key or secret" }, { status: 400 });
        }
        const env = environment === "demo" ? "demo" : "live";

        const check = await testConnection(env, apiKey, apiSecret);
        if (!check.ok) {
            return NextResponse.json({ error: `Invalid credentials: ${check.error}` }, { status: 400 });
        }

        const [apiKeyEncrypted, apiSecretEncrypted] = await Promise.all([
            encryptSecret(apiKey),
            encryptSecret(apiSecret),
        ]);

        const userId = (session.user as any).id as string;

        const account = await db.t212Account.upsert({
            where: { userId_environment: { userId, environment: env } },
            create: {
                userId,
                environment: env,
                apiKeyEncrypted,
                apiSecretEncrypted,
                currency: check.currency,
            },
            update: {
                apiKeyEncrypted,
                apiSecretEncrypted,
                currency: check.currency,
                lastSyncError: null,
            },
        });

        // Sincronizare imediată, ca userul să vadă date fără să aștepte cron-ul de 24h
        const syncResult = await syncT212Account(account.id);

        return NextResponse.json({
            connected: true,
            environment: account.environment,
            maskedApiKey: maskSecret(apiKey),
            syncResult,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? "Failed to connect" }, { status: 500 });
    }
}

/** DELETE: disconnect the Trading212 account */
export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id as string;

    await db.t212Account.deleteMany({ where: { userId } });

    return NextResponse.json({ success: true });
}
