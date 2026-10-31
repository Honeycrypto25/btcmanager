export const dynamic = "force-dynamic";

import { requireSectionAccess } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getCurrentBtcPrice } from "@/lib/btc";
import { getBtcAth } from "@/lib/btc-ath";
import WalletsPageClient, { type WalletStats } from "./WalletsPageClient";

export default async function WalletsPage() {
    await requireSectionAccess("btc");

    const transactions = await db.bitcoinTransaction.findMany({
        select: { walletId: true, amount: true, priceAtTime: true },
    });
    const currentPrice = await getCurrentBtcPrice();
    const ath = await getBtcAth(currentPrice);
    const athPrice = ath?.price ?? 0;

    const acc: Record<string, { invested: number; btc: number }> = {};
    for (const tx of transactions) {
        const cur = (acc[tx.walletId] ??= { invested: 0, btc: 0 });
        cur.invested += tx.amount * tx.priceAtTime;
        cur.btc += tx.amount;
    }
    const stats: Record<string, WalletStats> = {};
    for (const [id, a] of Object.entries(acc)) {
        stats[id] = { invested: a.invested, btc: a.btc, valueNow: a.btc * currentPrice, valueAtAth: a.btc * athPrice };
    }

    return <WalletsPageClient stats={stats} athPrice={athPrice} />;
}
