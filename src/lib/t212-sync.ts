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
 * Sincronizează contul Trading212: preia cash, poziții, pies și tranzacții
 * de la API-ul lor (credențiale din T212_API_KEY / T212_API_SECRET, setate
 * direct în Vercel — nu sunt introduse niciodată prin UI sau stocate în DB),
 * salvează un snapshot nou și adaugă orice depunere/retragere nouă în
 * istoricul cash-flow (deduplicat după id-ul T212).
 *
 * Cash-ul e singurul apel considerat critic (fără el nu avem ce salva).
 * Poziții, pies și tranzacții sunt independente — dacă unul eșuează (ex: 429
 * pe un singur endpoint), restul tot se salvează, în loc să blocheze tot
 * sync-ul așa cum se întâmpla înainte.
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

        // Cash-ul e esențial — dacă asta eșuează, nu avem ce salva, deci
        // sync-ul chiar eșuează (cade în catch-ul de mai jos).
        const cash = await getAccountCash(environment, creds.apiKey, creds.apiSecret);
        await sleep(1500);

        const partialErrors: string[] = [];

        // Poziții și pies — independente una de alta. Dacă una pică (ex: 429
        // pe /equity/pies), nu mai blocăm cash-ul, snapshot-ul sau tranzacțiile.
        let positions: Awaited<ReturnType<typeof getPortfolio>> = [];
        try {
            positions = await getPortfolio(environment, creds.apiKey, creds.apiSecret);
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
                currency: account.currency ?? "GBP",
                positions: positions as any,
                pies: pies as any,
            },
        });

        // Tranzacții cash — folosite pentru totalurile investite lunar/anual pe overview.
        // Includem și TRANSFER (nu doar DEPOSIT/WITHDRAW) — la conturile ISA banii
        // pot intra printr-un transfer de la alt broker, nu neapărat o "depunere" clasică.
        let txSyncInfo: string;
        try {
            await sleep(3000);
            const transactions = await getAllCashTransactions(environment, creds.apiKey, creds.apiSecret);
            const relevantTypes = new Set(["DEPOSIT", "WITHDRAW", "TRANSFER"]);
            const cashOnly = transactions.filter((t) => relevantTypes.has(t.type));
            const seenTypes = Array.from(new Set(transactions.map((t) => t.type)));

            // Diagnostic ÎNTOTDEAUNA populat, indiferent de rezultat — ca să vedem
            // exact ce a răspuns Trading212, nu doar când ceva pare "greșit".
            const sample = transactions.slice(0, 3).map((t) => `${t.type}:${t.amount}`).join(", ");
            txSyncInfo = `Fetched ${transactions.length} raw transactions. Types seen: [${seenTypes.join(", ") || "none"}]. ${cashOnly.length} matched DEPOSIT/WITHDRAW/TRANSFER.${sample ? ` Sample: ${sample}` : ""}`;

            if (transactions.length === 0) {
                partialErrors.push("Transactions: Trading212 returned zero transactions for this account.");
            } else if (cashOnly.length === 0) {
                partialErrors.push(`Transactions: fetched ${transactions.length} but none matched expected types. Types seen: ${seenTypes.join(", ")}`);
            }

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
            // eroarea complet — o arătăm în UI.
            const msg = errMsg(txErr);
            txSyncInfo = `Fetch threw an error: ${msg}`;
            partialErrors.push(`Transactions: ${msg}`);
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
