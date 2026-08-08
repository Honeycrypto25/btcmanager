import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import {
    getAccountCash,
    getPortfolio,
    getPies,
    getAllCashTransactions,
    T212ApiError,
} from "@/lib/t212";

/**
 * Sincronizează un cont Trading212: preia cash, poziții, pies și tranzacții
 * de la API-ul lor, salvează un snapshot nou și adaugă orice depunere/
 * retragere nouă în istoricul cash-flow (deduplicat după id-ul T212).
 *
 * Citim mereu starea CURENTĂ (nu cantități presupuse fixe), deci orice
 * rebalansare automată a unui pie e reflectată automat, fără logică specială.
 */
export async function syncT212Account(accountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const account = await db.t212Account.findUnique({ where: { id: accountId } });
    if (!account) return { ok: false, error: "Account not found" };

    try {
        const apiKey = await decryptSecret(account.apiKeyEncrypted);
        const apiSecret = await decryptSecret(account.apiSecretEncrypted);

        const [cash, positions, pies] = await Promise.all([
            getAccountCash(account.environment, apiKey, apiSecret),
            getPortfolio(account.environment, apiKey, apiSecret),
            getPies(account.environment, apiKey, apiSecret),
        ]);

        await db.t212Snapshot.create({
            data: {
                accountId: account.id,
                totalValue: cash.total,
                investedValue: cash.invested,
                freeCash: cash.free,
                resultPpl: cash.result,
                currency: account.currency ?? "USD",
                positions: positions as any,
                pies: pies as any,
            },
        });

        // Tranzacții cash — folosite pentru totalurile investite lunar/anual pe overview
        try {
            const transactions = await getAllCashTransactions(account.environment, apiKey, apiSecret);
            const cashOnly = transactions.filter(
                (t) => t.type === "DEPOSIT" || t.type === "WITHDRAWAL"
            );

            for (const tx of cashOnly) {
                if (tx.id === undefined || tx.id === null) continue;
                await db.t212CashFlow.upsert({
                    where: {
                        accountId_externalId: {
                            accountId: account.id,
                            externalId: String(tx.id),
                        },
                    },
                    create: {
                        accountId: account.id,
                        externalId: String(tx.id),
                        type: tx.type,
                        amount: tx.amount,
                        dateTime: new Date(tx.dateTime),
                    },
                    update: {
                        amount: tx.amount,
                    },
                });
            }
        } catch (txErr) {
            // Nu blocăm tot sync-ul dacă doar istoricul de tranzacții eșuează —
            // cash-ul și pozițiile curente sunt mai importante.
            console.error("T212 cash flow sync failed:", txErr);
        }

        await db.t212Account.update({
            where: { id: account.id },
            data: { lastSyncedAt: new Date(), lastSyncError: null },
        });

        return { ok: true };
    } catch (err: any) {
        const message = err instanceof T212ApiError ? err.message : (err?.message ?? "Sync failed");

        await db.t212Account.update({
            where: { id: account.id },
            data: { lastSyncError: message },
        });

        return { ok: false, error: message };
    }
}

/** Sincronizează toate conturile T212 înregistrate — apelat din cron */
export async function syncAllT212Accounts(): Promise<{ accountId: string; result: Awaited<ReturnType<typeof syncT212Account>> }[]> {
    const accounts = await db.t212Account.findMany({ select: { id: true } });
    const results = [];
    for (const acc of accounts) {
        const result = await syncT212Account(acc.id);
        results.push({ accountId: acc.id, result });
    }
    return results;
}

/** Cel mai recent snapshot pentru un cont, dacă există */
export async function getLatestSnapshot(accountId: string) {
    return db.t212Snapshot.findFirst({
        where: { accountId },
        orderBy: { capturedAt: "desc" },
    });
}
