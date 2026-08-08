import { db } from "@/lib/db";
import {
    getAccountInfo,
    getAccountCash,
    getPositions,
    getPies,
    getAllCashTransactions,
    getAllOrders,
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

function errMsg(err: any): string {
    return err instanceof T212ApiError ? err.message : (err?.message ?? "failed");
}

/** Găsește (sau creează) rândul T212Account pentru mediul curent — nu există per-user, e un singur cont, global la nivel de deployment */
async function ensureT212Account(currency?: string) {
    const environment = getEnvironment();
    const existing = await db.t212Account.findUnique({ where: { environment } });
    if (existing) return existing;
    return db.t212Account.create({ data: { environment, currency } });
}

/**
 * Sincronizează contul Trading212: preia cash, poziții, pies, istoric de
 * ordine și tranzacții cash de la API-ul lor (credențiale din
 * T212_API_KEY / T212_API_SECRET, setate direct în Vercel — nu sunt
 * introduse niciodată prin UI sau stocate în DB).
 *
 * Cash-ul e singurul apel considerat critic (fără el nu avem ce salva).
 * Poziții, pies, ordine și tranzacții sunt independente — dacă unul
 * eșuează (ex: 429 pe un singur endpoint), restul tot se salvează.
 *
 * Istoricul de ORDINE (cumpărări/vânzări) e sursa principală pentru "cât
 * s-a investit" — la conturile cu investiție automată recurentă, banii nu
 * trec printr-o "depunere" cash separată, ci direct în ordine de
 * cumpărare, deci tranzacțiile cash (DEPOSIT/WITHDRAW/TRANSFER) pot fi goale
 * chiar dacă s-a investit constant.
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
        const accountCurrency = account.currency ?? "GBP";

        // Cash-ul e esențial — dacă asta eșuează, nu avem ce salva, deci
        // sync-ul chiar eșuează (cade în catch-ul de mai jos).
        const cash = await getAccountCash(environment, creds.apiKey, creds.apiSecret);
        await sleep(1500);

        const partialErrors: string[] = [];

        // Poziții și pies — independente una de alta.
        let positions: Awaited<ReturnType<typeof getPositions>> = [];
        try {
            positions = await getPositions(environment, creds.apiKey, creds.apiSecret, accountCurrency);
        } catch (posErr: any) {
            partialErrors.push(`Positions: ${errMsg(posErr)}`);
        }
        await sleep(1500);

        let pies: Awaited<ReturnType<typeof getPies>> = [];
        try {
            pies = await getPies(environment, creds.apiKey, creds.apiSecret);
        } catch (piesErr: any) {
            partialErrors.push(`Pies: ${errMsg(piesErr)}`);
        }

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
                currency: accountCurrency,
                positions: positions as any,
                pies: pies as any,
            },
        });

        // Istoric ORDINE (cumpărări/vânzări) — sursa principală pentru
        // "cât s-a investit lunar/anual".
        let txSyncInfo: string;
        try {
            await sleep(3000);
            const orders = await getAllOrders(environment, creds.apiKey, creds.apiSecret, accountCurrency);
            const buys = orders.filter((o) => o.side === "BUY");
            txSyncInfo = `Fetched ${orders.length} filled orders (${buys.length} buys).`;

            if (orders.length === 0) {
                partialErrors.push("Orders: Trading212 returned zero filled orders for this account.");
            }

            for (const o of orders) {
                await db.t212Order.upsert({
                    where: {
                        accountId_externalId: {
                            accountId: account.id,
                            externalId: o.externalId,
                        },
                    },
                    create: {
                        accountId: account.id,
                        externalId: o.externalId,
                        ticker: o.ticker,
                        name: o.name,
                        side: o.side,
                        quantity: o.quantity,
                        price: o.price,
                        priceCurrency: o.priceCurrency,
                        total: o.total,
                        filledAt: new Date(o.filledAt),
                        realizedProfit: o.realizedProfit,
                    },
                    update: {
                        total: o.total,
                        realizedProfit: o.realizedProfit,
                    },
                });
            }
        } catch (orderErr: any) {
            const msg = errMsg(orderErr);
            txSyncInfo = `Order history fetch threw an error: ${msg}`;
            partialErrors.push(`Orders: ${msg}`);
            console.error("T212 order history sync failed:", orderErr);
        }

        // Tranzacții cash (depuneri/retrageri) — le păstrăm ca sursă secundară;
        // pot fi goale la conturile cu investiție automată recurentă, unde banii
        // trec direct în ordine de cumpărare, fără o "depunere" separată.
        try {
            await sleep(3000);
            const transactions = await getAllCashTransactions(environment, creds.apiKey, creds.apiSecret);
            const relevantTypes = new Set(["DEPOSIT", "WITHDRAW", "TRANSFER"]);
            const cashOnly = transactions.filter((t) => relevantTypes.has(t.type));
            txSyncInfo += ` Cash transactions: ${transactions.length} raw, ${cashOnly.length} matched.`;

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
            const msg = errMsg(txErr);
            txSyncInfo += ` Cash transactions fetch failed: ${msg}`;
            console.error("T212 cash flow sync failed:", txErr);
        }

        await db.t212Account.update({
            where: { id: account.id },
            data: {
                lastSyncedAt: new Date(),
                lastSyncError: partialErrors.length > 0 ? partialErrors.join(" | ") : null,
                lastTxSyncInfo: txSyncInfo,
            },
        });

        return { ok: true };
    } catch (err: any) {
        const message = errMsg(err);

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
        lastTxSyncInfo: account?.lastTxSyncInfo ?? null,
    };
}

export { testConnection as testT212Credentials };
