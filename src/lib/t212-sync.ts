import { db } from "@/lib/db";
import {
    getAccountInfo,
    getAccountCash,
    getPortfolio,
    getPies,
    getAllCashTransactions,
    testConnection,
    T212ApiError,
} from "@/lib/t212";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEnvironment(): string {
    return process.env.T212_ENVIRONMENT === "demo" ? "demo" : "live";
}

function getCredentials(): { apiKey: string; apiSecret: string } | null {
    const apiKey = process.env.T212_API_KEY;
    const apiSecret = process.env.T212_API_SECRET;
    if (!apiKey || !apiSecret) return null;
    return { apiKey, apiSecret };
}

/** Găsește (sau creează) rândul T212Account pentru mediul curent — nu există per-user, e un singur cont, global la nivel de deployment */
async function ensureT212Account(currency?: string) {
    const environment = getEnvironment();
    const existing = await db.t212Account.findUnique({ where: { environment } });
    if (existing) return existing;
    return db.t212Account.create({ data: { environment, currency } });
}

/**
 * Sincronizează contul Trading212: preia cash, poziții, pies și tranzacții
 * de la API-ul lor (credențiale din T212_API_KEY / T212_API_SECRET, setate
 * direct în Vercel — nu sunt introduse niciodată prin UI sau stocate în DB),
 * salvează un snapshot nou și adaugă orice depunere/retragere nouă în
 * istoricul cash-flow (deduplicat după id-ul T212).
 *
 * Citim mereu starea CURENTĂ (nu cantități presupuse fixe), deci orice
 * rebalansare automată a unui pie e reflectată automat, fără logică specială.
 */
export async function syncT212Account(): Promise<{ ok: true } | { ok: false; error: string }> {
    const creds = getCredentials();
    if (!creds) {
        return { ok: false, error: "T212_API_KEY / T212_API_SECRET nu sunt setate în variabilele de mediu" };
    }
    const environment = getEnvironment();

    try {
        let account = await ensureT212Account();

        // Prindem moneda reală a contului o singură dată — nu la fiecare sync,
        // ca să nu adăugăm un apel API în plus de fiecare dată (moneda contului
        // practic nu se schimbă niciodată).
        if (!account.currency) {
            const info = await getAccountInfo(environment, creds.apiKey, creds.apiSecret);
            const currency = info?.currencyCode ?? info?.currency ?? null;
            if (currency) {
                account = await db.t212Account.update({
                    where: { id: account.id },
                    data: { currency },
                });
            }
            await sleep(1500);
        }

        // Secvențial, nu Promise.all — Trading212 are limite stricte per-endpoint
        // (ex: 1 cerere/5s pe unele rute); cererile paralele multiplică riscul de 429.
        const cash = await getAccountCash(environment, creds.apiKey, creds.apiSecret);
        await sleep(1500);
        const positions = await getPortfolio(environment, creds.apiKey, creds.apiSecret);
        await sleep(1500);
        const pies = await getPies(environment, creds.apiKey, creds.apiSecret);

        // P&L calculat ca total - liber - investit, NU preluat direct din
        // câmpul result/ppl al T212 — acela pare să reflecte altceva (posibil
        // variația de azi), nu profitul/pierderea totală față de cât s-a
        // investit. total = liber + investit + P&L, deci P&L = total - liber - investit.
        const resultPpl = cash.total - cash.free - cash.invested;

        await db.t212Snapshot.create({
            data: {
                accountId: account.id,
                totalValue: cash.total,
                investedValue: cash.invested,
                freeCash: cash.free,
                resultPpl,
                currency: account.currency ?? "GBP",
                positions: positions as any,
                pies: pies as any,
            },
        });

        // Tranzacții cash — folosite pentru totalurile investite lunar/anual pe overview
        let cashFlowError: string | null = null;
        try {
            await sleep(3000);
            const transactions = await getAllCashTransactions(environment, creds.apiKey, creds.apiSecret);
            const cashOnly = transactions.filter(
                (t) => t.type === "DEPOSIT" || t.type === "WITHDRAW"
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
        } catch (txErr: any) {
            // Nu blocăm tot sync-ul dacă doar istoricul de tranzacții eșuează —
            // cash-ul și pozițiile curente sunt mai importante. Dar NU ascundem
            // eroarea complet — o arătăm în UI, ca să știi că investitul
            // lunar/anual poate fi incomplet.
            cashFlowError = txErr instanceof T212ApiError ? txErr.message : (txErr?.message ?? "Cash flow sync failed");
            console.error("T212 cash flow sync failed:", txErr);
        }

        await db.t212Account.update({
            where: { id: account.id },
            data: {
                lastSyncedAt: new Date(),
                lastSyncError: cashFlowError ? `Positions synced OK, but transaction history failed: ${cashFlowError}` : null,
            },
        });

        return { ok: true };
    } catch (err: any) {
        const message = err instanceof T212ApiError ? err.message : (err?.message ?? "Sync failed");

        // Salvăm eroarea doar dacă rândul deja există — nu creăm un cont "gol" doar ca să înregistrăm o eroare
        const existing = await db.t212Account.findUnique({ where: { environment } });
        if (existing) {
            await db.t212Account.update({
                where: { id: existing.id },
                data: { lastSyncError: message },
            });
        }

        return { ok: false, error: message };
    }
}

/** Status rapid: sunt credențialele setate și valide? Folosit de UI-ul din Admin. */
export async function getT212ConnectionStatus() {
    const creds = getCredentials();
    if (!creds) {
        return { configured: false as const };
    }

    const environment = getEnvironment();
    const account = await db.t212Account.findUnique({ where: { environment } });

    return {
        configured: true as const,
        environment,
        currency: account?.currency ?? null,
        lastSyncedAt: account?.lastSyncedAt ?? null,
        lastSyncError: account?.lastSyncError ?? null,
    };
}

export { testConnection as testT212Credentials };
