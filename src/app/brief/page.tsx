import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getCurrentBtcPrice } from "@/lib/btc";
import BriefClient from "./BriefClient";

export default async function BriefPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const [currentPrice, wallets] = await Promise.all([
    getCurrentBtcPrice(),
    db.bitcoinWallet.findMany({
      include: {
        transactions: {
          orderBy: { timestamp: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const generatedAt = new Date().toISOString();

  const walletData = wallets.map((wallet) => {
    const btc = wallet.transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const invested = wallet.transactions.reduce(
      (sum, tx) => sum + tx.amount * tx.priceAtTime,
      0
    );

    return {
      id: wallet.id,
      name: wallet.name,
      address: wallet.address,
      btc,
      invested,
      txCount: wallet.transactions.length,
      lastActivity:
        wallet.transactions[wallet.transactions.length - 1]?.timestamp.toISOString() ?? null,
    };
  });

  return (
    <DashboardLayout>
      <BriefClient
        currentPrice={currentPrice}
        wallets={walletData}
        generatedAt={generatedAt}
      />
    </DashboardLayout>
  );
}
