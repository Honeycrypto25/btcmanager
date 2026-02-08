import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncWallet } from "@/lib/btc";

/** GET: List all wallets */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const wallets = await db.bitcoinWallet.findMany({
        include: { _count: { select: { transactions: true } } },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(wallets);
}

/** POST: Add a new wallet */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { name, address } = await req.json();
        if (!name || !address) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        // 1. Create Wallet in DB
        const wallet = await db.bitcoinWallet.create({
            data: { name, address: address.trim() },
        });

        // 2. Trigger Initial Sync (Background-ish but wait for it here for UX)
        await syncWallet(wallet.id, address);

        return NextResponse.json(wallet);
    } catch (err: any) {
        if (err.code === 'P2002') return NextResponse.json({ error: "Address already exists" }, { status: 400 });
        return NextResponse.json({ error: "Failed to create wallet" }, { status: 500 });
    }
}

/** DELETE: Remove a wallet */
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

        await db.bitcoinWallet.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete wallet" }, { status: 500 });
    }
}

/** PUT: Sync a wallet or all wallets */
export async function PUT(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (id) {
            // Sync specific wallet
            const wallet = await db.bitcoinWallet.findUnique({ where: { id } });
            if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

            const result = await syncWallet(wallet.id, wallet.address);
            return NextResponse.json({ success: true, ...result });
        } else {
            // Sync ALL wallets
            const wallets = await db.bitcoinWallet.findMany();
            console.log(`Syncing all ${wallets.length} wallets...`);

            const results = await Promise.all(
                wallets.map((w: any) => syncWallet(w.id, w.address).catch((e: any) => ({ error: e.message, walletId: w.id })))
            );

            return NextResponse.json({ success: true, results });
        }
    } catch (err) {
        console.error("Sync error:", err);
        return NextResponse.json({ error: "Failed to sync wallets" }, { status: 500 });
    }
}
