import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncWallet } from "@/lib/btc";

function unauthorized(req?: NextRequest) {
    if (req) {
        console.warn("Wallet API unauthorized", {
            host: req.headers.get("host"),
            forwardedHost: req.headers.get("x-forwarded-host"),
            forwardedProto: req.headers.get("x-forwarded-proto"),
            nextAuthUrl: process.env.NEXTAUTH_URL,
            hasSessionToken:
                req.cookies.has("next-auth.session-token") ||
                req.cookies.has("__Secure-next-auth.session-token"),
        });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** GET: List all wallets */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized(req);

    const wallets = await db.bitcoinWallet.findMany({
        include: { _count: { select: { transactions: true } } },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(wallets);
}

// Validare format adresă Bitcoin: Legacy (1...), SegWit (3...), Bech32 (bc1...)
function isValidBitcoinAddress(address: string): boolean {
    return /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{6,87})$/.test(address);
}

/** POST: Add a new wallet */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized(req);

    try {
        const { name, address } = await req.json();
        if (!name || !address) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        const normalizedAddress = address.trim();

        if (!isValidBitcoinAddress(normalizedAddress)) {
            return NextResponse.json({ error: "Invalid Bitcoin address format" }, { status: 400 });
        }
        const wallet = await db.bitcoinWallet.create({
            data: { name, address: normalizedAddress },
        });
        const sync = await syncWallet(wallet.id, normalizedAddress);

        return NextResponse.json({ wallet, sync });
    } catch (err: any) {
        console.error("Failed to create wallet", err);
        if (err.code === 'P2002') return NextResponse.json({ error: "Address already exists" }, { status: 400 });
        return NextResponse.json({ error: err.message || "Failed to create wallet" }, { status: 500 });
    }
}

/** DELETE: Remove a wallet */
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized(req);

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

        await db.bitcoinWallet.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Failed to delete wallet", err);
        return NextResponse.json({ error: "Failed to delete wallet" }, { status: 500 });
    }
}

/** PUT: Sync a wallet or all wallets */
export async function PUT(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized(req);

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (id) {
            const wallet = await db.bitcoinWallet.findUnique({ where: { id } });
            if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

            const result = await syncWallet(wallet.id, wallet.address);
            return NextResponse.json({ success: true, walletId: wallet.id, walletName: wallet.name, ...result });
        }

        const wallets = await db.bitcoinWallet.findMany();
        console.log(`Syncing all ${wallets.length} wallets...`);

        const results = await Promise.all(
            wallets.map(async wallet => {
                try {
                    const result = await syncWallet(wallet.id, wallet.address);
                    return { walletId: wallet.id, walletName: wallet.name, address: wallet.address, success: true, ...result };
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Unknown sync error";
                    console.error(`Wallet sync failed for ${wallet.address}:`, error);
                    return { walletId: wallet.id, walletName: wallet.name, address: wallet.address, success: false, error: message };
                }
            })
        );

        return NextResponse.json({
            success: results.every(result => result.success),
            added: results.reduce((sum, result) => sum + ('added' in result ? result.added : 0), 0),
            failed: results.filter(result => !result.success).length,
            results,
        });
    } catch (err) {
        console.error("Sync error:", err);
        return NextResponse.json({ error: "Failed to sync wallets" }, { status: 500 });
    }
}
