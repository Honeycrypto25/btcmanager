import "server-only";
import { db } from "@/lib/db";
import { getUkTaxYear } from "@/lib/tax/uk-tax-year";
import { runMatchingForTransactions } from "@/lib/bank/run-matching";
import {
    refreshAccessToken,
    fetchAccounts,
    fetchTransactions,
    type TrueLayerTransaction,
} from "@/lib/bank/truelayer";
import crypto from "crypto";

/** Same hash shape as computeRowHash in lib/bank/csv.ts (date + description
 * + amount + debit/credit, per user) so a transaction pulled via the API
 * dedupes correctly against one already imported by CSV, and vice versa. */
function computeTransactionHash(userId: string, transactionDate: Date, description: string, amount: number, debitCredit: "DEBIT" | "CREDIT"): string {
    const key = `${userId}|${transactionDate.toISOString().slice(0, 10)}|${description.trim().toLowerCase()}|${amount.toFixed(2)}|${debitCredit}`;
    return crypto.createHash("sha256").update(key).digest("hex");
}

// Refresh a bit before actual expiry to avoid racing a request that's mid-flight.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function ensureFreshAccessToken(connection: { id: string; accessToken: string; refreshToken: string; accessTokenExpiresAt: Date }): Promise<string> {
    if (connection.accessTokenExpiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) {
        return connection.accessToken;
    }
    const refreshed = await refreshAccessToken(connection.refreshToken);
    await db.bankConnection.update({
        where: { id: connection.id },
        data: {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        },
    });
    return refreshed.access_token;
}

/** Syncs every connected TrueLayer bank login for every user: refreshes the
 * access token if needed, re-discovers accounts (find-or-create a
 * BankAccount per external account id), pulls transactions, inserts new
 * ones (deduped the same way manual CSV import is), and runs the same
 * receipt-matching pass. Designed to be safe to call repeatedly (e.g. daily
 * cron) — already-imported transactions are always skipped. */
export async function syncAllTrueLayerConnections() {
    const connections = await db.bankConnection.findMany({ where: { provider: "truelayer" } });

    const results: Array<{ connectionId: string; accountsSynced: number; importedCount: number; matchedCount: number; error?: string }> = [];

    for (const connection of connections) {
        try {
            const accessToken = await ensureFreshAccessToken(connection);
            const accounts = await fetchAccounts(accessToken);

            let importedCount = 0;
            let matchedCount = 0;

            for (const account of accounts) {
                const bankAccount = await db.bankAccount.upsert({
                    where: { userId_externalAccountId: { userId: connection.userId, externalAccountId: account.account_id } },
                    update: { name: account.display_name, currency: account.currency, connectionId: connection.id },
                    create: {
                        userId: connection.userId,
                        connectionId: connection.id,
                        externalAccountId: account.account_id,
                        name: account.display_name,
                        currency: account.currency,
                    },
                });

                // Overlapping window on purpose — a couple of days of
                // overlap costs nothing (dedup hash skips anything already
                // stored) and covers transactions that were still pending
                // at the previous sync and only settled since.
                const since = connection.lastSyncedAt
                    ? new Date(connection.lastSyncedAt.getTime() - 3 * 24 * 60 * 60 * 1000)
                    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

                let transactions: TrueLayerTransaction[];
                try {
                    transactions = await fetchTransactions(accessToken, account.account_id, since.toISOString().slice(0, 10));
                } catch (err) {
                    // One account failing (e.g. temporarily unavailable at the
                    // provider) shouldn't stop the others in the same connection.
                    console.error(`TrueLayer: failed to fetch transactions for account ${account.account_id}`, err);
                    continue;
                }

                if (transactions.length === 0) continue;

                const batch = await db.bankImportBatch.create({
                    data: {
                        userId: connection.userId,
                        bankAccountId: bankAccount.id,
                        filename: `TrueLayer sync — ${account.display_name} — ${new Date().toISOString().slice(0, 10)}`,
                        columnMapping: { source: "truelayer" },
                        rowCount: transactions.length,
                        importedCount: 0,
                        duplicateCount: 0,
                    },
                });

                const insertedIds: string[] = [];
                let duplicateCount = 0;

                for (const tx of transactions) {
                    const transactionDate = new Date(tx.timestamp);
                    const debitCredit: "DEBIT" | "CREDIT" = tx.amount < 0 ? "DEBIT" : "CREDIT";
                    const amount = Math.abs(tx.amount);
                    const description = tx.merchant_name || tx.description;

                    const hash = computeTransactionHash(connection.userId, transactionDate, description, amount, debitCredit);
                    const existing = await db.bankTransaction.findUnique({
                        where: { userId_originalRowHash: { userId: connection.userId, originalRowHash: hash } },
                    });
                    if (existing) {
                        duplicateCount += 1;
                        continue;
                    }

                    const created = await db.bankTransaction.create({
                        data: {
                            userId: connection.userId,
                            accountId: bankAccount.id,
                            transactionDate,
                            description,
                            amount,
                            debitCredit,
                            balance: tx.running_balance?.amount ?? null,
                            category: tx.transaction_category || null,
                            taxYear: getUkTaxYear(transactionDate),
                            importBatchId: batch.id,
                            originalRowHash: hash,
                        },
                    });
                    insertedIds.push(created.id);
                }

                await db.bankImportBatch.update({
                    where: { id: batch.id },
                    data: { importedCount: insertedIds.length, duplicateCount },
                });

                importedCount += insertedIds.length;
                matchedCount += await runMatchingForTransactions(connection.userId, insertedIds);
            }

            await db.bankConnection.update({
                where: { id: connection.id },
                data: { lastSyncedAt: new Date(), lastSyncError: null },
            });

            results.push({ connectionId: connection.id, accountsSynced: accounts.length, importedCount, matchedCount });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`TrueLayer: sync failed for connection ${connection.id}`, err);
            await db.bankConnection.update({
                where: { id: connection.id },
                data: { lastSyncError: message.slice(0, 500) },
            });
            results.push({ connectionId: connection.id, accountsSynced: 0, importedCount: 0, matchedCount: 0, error: message });
        }
    }

    return { connectionsSynced: connections.length, results };
}
