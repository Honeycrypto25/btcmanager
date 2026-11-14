"use server";

import { requireAdmin } from "@/lib/permissions";
import { testAirdrop, testBalances, testLimitOrder, testMessageSigning, testSellOrder, testSigning, testSwap, testTokenTransfer, testTransfer, testUltraSwap, type TestNet, type TestResult } from "@/lib/solana/v3/test-ops";

export type SolanaTestId = "signing" | "balances-devnet" | "airdrop" | "transfer-devnet" | "balances-mainnet" | "transfer-mainnet" | "swap" | "limit-order" | "sell-order" | "ultra-swap" | "token-transfer" | "message-signing";

/** Runs one test of the @solana/web3.js v3 bench with the dedicated test wallet. Admin only. */
export async function runSolanaTest(id: SolanaTestId): Promise<TestResult> {
    await requireAdmin();
    const net = (n: TestNet) => n;
    switch (id) {
        case "signing":
            return testSigning();
        case "balances-devnet":
            return testBalances(net("devnet"));
        case "airdrop":
            return testAirdrop();
        case "transfer-devnet":
            return testTransfer(net("devnet"));
        case "balances-mainnet":
            return testBalances(net("mainnet"));
        case "transfer-mainnet":
            return testTransfer(net("mainnet"));
        case "swap":
            return testSwap(1);
        case "limit-order":
            return testLimitOrder();
        case "sell-order":
            return testSellOrder();
        case "ultra-swap":
            return testUltraSwap(1);
        case "token-transfer":
            return testTokenTransfer();
        case "message-signing":
            return testMessageSigning();
        default:
            return { ok: false, lines: ["Test necunoscut."] };
    }
}
