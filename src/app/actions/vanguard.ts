"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { parseFidelityAccountDetails } from "@/lib/vanguard/fidelity-csv";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

// --- Vanguard accounts ---

export interface VanguardAccountInput {
    name: string;
    accountType?: string;
    currency?: string;
    owner?: string; // "self" | "spouse" | "child" | "other"
    ownerLabel?: string;
}

export async function createVanguardAccount(input: VanguardAccountInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const account = await db.vanguardAccount.create({
        data: {
            userId,
            name: input.name,
            accountType: input.accountType || null,
            currency: input.currency || "GBP",
            owner: input.owner || "self",
            ownerLabel: input.ownerLabel || null,
        },
    });
    revalidatePath("/vanguard");
    revalidatePath("/investments");
    return account;
}

export async function deleteVanguardAccount(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.vanguardAccount.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.vanguardAccount.delete({ where: { id } }); // cascades holdings
    revalidatePath("/vanguard");
    revalidatePath("/investments");
}

export async function listVanguardAccounts() {
    const userId = await requireUserId();
    return db.vanguardAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, include: { holdings: true } });
}

// --- Vanguard holdings (manually entered/updated — no live pricing feed) ---

export interface VanguardHoldingInput {
    accountId: string;
    fundName: string;
    ticker?: string;
    units?: number;
    costBasis: number;
    currentValue: number;
    notes?: string;
}

export interface VanguardContributionInput {
    holdingId: string;
    date: string; // ISO date
    units: number;
    amount: number;
    notes?: string;
}

async function requireOwnedAccount(userId: string, accountId: string) {
    const account = await db.vanguardAccount.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) throw new Error("Vanguard account not found");
    return account;
}

export async function createVanguardHolding(input: VanguardHoldingInput) {
    await requireAdmin();
    const userId = await requireUserId();
    await requireOwnedAccount(userId, input.accountId);

    const holding = await db.vanguardHolding.create({
        data: {
            userId,
            accountId: input.accountId,
            fundName: input.fundName,
            ticker: input.ticker || null,
            units: input.units ?? null,
            costBasis: input.costBasis,
            currentValue: input.currentValue,
            notes: input.notes || null,
        },
    });
    revalidatePath("/vanguard");
    revalidatePath("/investments");
    return holding;
}

/** Updates just the current value (+ optionally units/cost basis) — the
 * routine "check in on my portfolio" action, since there's no live feed. */
export async function updateVanguardHoldingValue(id: string, currentValue: number, units?: number) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.vanguardHolding.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const holding = await db.vanguardHolding.update({
        where: { id },
        data: { currentValue, units: units ?? existing.units, valueUpdatedAt: new Date() },
    });
    revalidatePath("/vanguard");
    revalidatePath("/investments");
    return holding;
}

export async function deleteVanguardHolding(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.vanguardHolding.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.vanguardHolding.delete({ where: { id } });
    revalidatePath("/vanguard");
    revalidatePath("/investments");
}

/** Logs a top-up (date + units + amount) against an existing holding and
 * folds it into the running totals -- units and costBasis both increase by
 * the contribution, and currentValue increases by the contributed amount
 * as a same-day best guess (the user, or the next price sync, can correct
 * it afterwards). This is what lets "how many units did I buy and when"
 * be answered later instead of only ever seeing the latest running total. */
export async function addVanguardContribution(input: VanguardContributionInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const holding = await db.vanguardHolding.findUnique({ where: { id: input.holdingId } });
    if (!holding || holding.userId !== userId) throw new Error("Not found");
    if (!input.units || input.units <= 0) throw new Error("Unitățile trebuie să fie un număr pozitiv.");
    if (!input.amount || input.amount <= 0) throw new Error("Suma trebuie să fie un număr pozitiv.");

    const [contribution, updatedHolding] = await db.$transaction([
        db.vanguardContribution.create({
            data: {
                holdingId: input.holdingId,
                date: new Date(input.date),
                units: input.units,
                amount: input.amount,
                notes: input.notes || null,
            },
        }),
        db.vanguardHolding.update({
            where: { id: input.holdingId },
            data: {
                units: Number(holding.units ?? 0) + input.units,
                costBasis: Number(holding.costBasis) + input.amount,
                currentValue: Number(holding.currentValue) + input.amount,
                valueUpdatedAt: new Date(),
            },
        }),
    ]);

    revalidatePath("/vanguard");
    revalidatePath("/investments");
    return { contribution, holding: updatedHolding };
}

/** Reverses a contribution -- subtracts it back out of the holding's
 * running totals and removes the row. Used to fix a mis-entered top-up. */
export async function deleteVanguardContribution(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const contribution = await db.vanguardContribution.findUnique({ where: { id }, include: { holding: true } });
    if (!contribution || contribution.holding.userId !== userId) throw new Error("Not found");

    await db.$transaction([
        db.vanguardHolding.update({
            where: { id: contribution.holdingId },
            data: {
                units: Number(contribution.holding.units ?? 0) - Number(contribution.units),
                costBasis: Number(contribution.holding.costBasis) - Number(contribution.amount),
                currentValue: Number(contribution.holding.currentValue) - Number(contribution.amount),
            },
        }),
        db.vanguardContribution.delete({ where: { id } }),
    ]);

    revalidatePath("/vanguard");
    revalidatePath("/investments");
}

/** Contribution history for a holding's expandable panel -- newest first. */
export async function getVanguardContributions(holdingId: string) {
    const userId = await requireUserId();
    const holding = await db.vanguardHolding.findUnique({ where: { id: holdingId } });
    if (!holding || holding.userId !== userId) throw new Error("Not found");

    const contributions = await db.vanguardContribution.findMany({
        where: { holdingId },
        orderBy: { date: "desc" },
    });
    return contributions.map((c: any) => ({
        id: c.id as string,
        date: c.date.toISOString(),
        units: Number(c.units),
        amount: Number(c.amount),
        notes: c.notes as string | null,
    }));
}

/** Price-evolution points for a holding's expandable chart -- only ever
 * populated for holdings that have a ticker/ISIN + units (see
 * lib/vanguard-price-sync.ts), so this can come back empty for a purely
 * manual holding. */
export async function getVanguardPriceHistory(holdingId: string) {
    const userId = await requireUserId();
    const holding = await db.vanguardHolding.findUnique({ where: { id: holdingId } });
    if (!holding || holding.userId !== userId) throw new Error("Not found");

    const history = await db.vanguardPriceHistory.findMany({
        where: { holdingId },
        orderBy: { capturedAt: "asc" },
    });
    return history.map((p: any) => ({
        capturedAt: p.capturedAt.toISOString(),
        price: Number(p.price),
        currency: p.currency,
    }));
}

/** Per-account portfolio value evolution, built from each holding's price
 * history (units are treated as constant at their current value -- there's
 * no historical "units held on date X" record, only a live snapshot, so
 * this is a best-effort reconstruction, not a perfectly accurate one if
 * units were ever changed after the fact).
 *
 * For every calendar date where ANY holding in ANY of the user's accounts
 * got a price point, each account's value on that date is the sum, over
 * its holdings, of (that holding's most recently known price at or before
 * that date) × its current units -- i.e. forward-filled, so an account
 * with an OEIC fund (long gaps between distinct prices) doesn't need a
 * point on every single date to still contribute a running value.
 * Holdings with no price history at all (purely manual, no ticker/ISIN)
 * don't contribute a time series here -- their value only ever shows up
 * in the current totals elsewhere on the page, not in this chart.
 */
export async function getVanguardAccountValueHistory() {
    const userId = await requireUserId();
    const accounts = await db.vanguardAccount.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: { holdings: { include: { priceHistory: { orderBy: { capturedAt: "asc" } } } } },
    });

    const allDates = new Set<string>();
    for (const acc of accounts as any[]) {
        for (const h of acc.holdings) {
            for (const p of h.priceHistory) {
                allDates.add(p.capturedAt.toISOString().slice(0, 10));
            }
        }
    }
    const sortedDates = Array.from(allDates).sort();

    const series = (accounts as any[])
        .map((acc) => {
            const points = sortedDates
                .map((date) => {
                    let value = 0;
                    let hasAny = false;
                    for (const h of acc.holdings) {
                        if (h.units === null) continue;
                        let lastPrice: number | null = null;
                        for (const p of h.priceHistory) {
                            if (p.capturedAt.toISOString().slice(0, 10) <= date) {
                                lastPrice = Number(p.price);
                            } else {
                                break;
                            }
                        }
                        if (lastPrice !== null) {
                            value += lastPrice * Number(h.units);
                            hasAny = true;
                        }
                    }
                    return hasAny ? { date, value } : null;
                })
                .filter((p): p is { date: string; value: number } => p !== null);
            return { accountId: acc.id as string, accountName: acc.name as string, points };
        })
        .filter((a) => a.points.length > 0);

    return series;
}

/** Per-account invested/value/pnl summary (native GBP figures) — used by
 * the Overview page's Vanguard card, which lists each account separately
 * since there will be several (own, spouse's, children's, ...). */
export async function getVanguardAccountSummaries() {
    const userId = await requireUserId();
    const accounts = await db.vanguardAccount.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: { holdings: true },
    });
    return accounts.map((a: any) => {
        const invested = a.holdings.reduce((s: number, h: any) => s + Number(h.costBasis), 0);
        const value = a.holdings.reduce((s: number, h: any) => s + Number(h.currentValue), 0);
        const pnl = value - invested;
        return {
            id: a.id as string,
            name: a.name as string,
            accountType: a.accountType as string | null,
            invested,
            value,
            pnl,
            pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
        };
    });
}

/** Total invested/value across all Vanguard holdings for this user — used
 * by both /vanguard and the unified /investments overview. */
export async function getVanguardTotals() {
    const userId = await requireUserId();
    const holdings = await db.vanguardHolding.findMany({ where: { userId } });
    const invested = holdings.reduce((s: number, h: any) => s + Number(h.costBasis), 0);
    const value = holdings.reduce((s: number, h: any) => s + Number(h.currentValue), 0);
    return { invested, value, pnl: value - invested, pnlPercent: invested > 0 ? ((value - invested) / invested) * 100 : 0, holdingCount: holdings.length };
}

export interface VanguardHoldingSignal {
    holdingId: string;
    currentPrice: number | null;
    avg3mPrice: number | null;
    avg3mSampleSize: number;
    currency: string;
}

/** "Is now a decent time to buy" signal per holding, driven by the
 * holding's own recorded price history (see lib/vanguard-price-sync.ts) —
 * distinct from costBasis/units (the entry price already shown in the
 * "Preț mediu de intrare" table), this adds the trailing-3-month average
 * of the daily NAV/market prices actually captured for that holding.
 *
 * Only holdings with a ticker/ISIN accumulate price history at all (the
 * daily auto-sync skips purely manual holdings), so a manual-only holding
 * comes back with avg3mPrice: null / avg3mSampleSize: 0 — the UI shows
 * "date insuficiente" rather than fabricate a signal from nothing. The
 * same "not enough samples yet" guard applies to a holding that just got
 * its ticker/ISIN added a few days ago. */
export async function getVanguardHoldingSignals(): Promise<VanguardHoldingSignal[]> {
    const userId = await requireUserId();
    const holdings = await db.vanguardHolding.findMany({
        where: { userId, ticker: { not: null } },
        include: { priceHistory: { orderBy: { capturedAt: "desc" } } },
    });

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    return (holdings as any[]).map((h) => {
        const recent = h.priceHistory.filter((p: any) => p.capturedAt >= ninetyDaysAgo);
        const avg3mPrice =
            recent.length > 0 ? recent.reduce((s: number, p: any) => s + Number(p.price), 0) / recent.length : null;
        const currentPrice =
            h.priceHistory.length > 0
                ? Number(h.priceHistory[0].price)
                : h.units && Number(h.units) > 0
                  ? Number(h.currentValue) / Number(h.units)
                  : null;
        return {
            holdingId: h.id as string,
            currentPrice,
            avg3mPrice,
            avg3mSampleSize: recent.length,
            currency: (recent[0]?.currency ?? h.priceHistory[0]?.currency ?? "GBP") as string,
        };
    });
}


// --- Fidelity CSV import (Eva-Maria's Junior ISA / Junior SIPP) ---
//
// Sergiu re-uploads Fidelity's "Account summary" CSV export every month or
// two. Both of Eva-Maria's accounts invest in a single fund (the same
// Vanguard FTSE Global All Cap Index Fund already tracked for Sergiu's own
// SIPP), so this reuses that fund's ticker/ISIN -- its price history (and
// the 3-month buy/wait signal) is then already populated for these
// holdings too, with no separate setup.
//
// Accounts are matched across uploads by the Fidelity account number
// embedded in the account's name -- "Junior ISA (AS10427098)" -- rather
// than a dedicated DB column, since that's the only identifier Fidelity's
// export carries and it doesn't change between uploads. A first-time
// import creates the account; every import after that just updates the
// existing one. An account with no invested holding yet (money still
// settling/pending, all value sitting in cashAvailableGBP) is left with
// no holding at all -- there's nothing yet to price -- and is reported
// back as "pending" instead of silently doing nothing.

const FIDELITY_CHILD_FUND_ISIN = "GB00BD3RZ582";
const FIDELITY_CHILD_FUND_NAME = "FTSE Global All Cap Index Fund Accumulation";

export interface FidelityImportResult {
    accountsCreated: number;
    accountsUpdated: number;
    holdingsCreated: number;
    holdingsUpdated: number;
    pendingAccountNumbers: string[];
}

export async function importFidelityAccountsCsv(csvText: string, ownerLabel: string): Promise<FidelityImportResult> {
    await requireAdmin();
    const userId = await requireUserId();

    const blocks = parseFidelityAccountDetails(csvText);
    const result: FidelityImportResult = {
        accountsCreated: 0,
        accountsUpdated: 0,
        holdingsCreated: 0,
        holdingsUpdated: 0,
        pendingAccountNumbers: [],
    };

    const existingAccounts = await db.vanguardAccount.findMany({ where: { userId }, include: { holdings: true } });

    for (const block of blocks) {
        let account = (existingAccounts as any[]).find((a) => a.name.includes(`(${block.accountNumber})`));

        if (!account) {
            const accountType = /isa/i.test(block.product) ? "JISA" : /sipp/i.test(block.product) ? "SIPP" : "Other";
            const created = await db.vanguardAccount.create({
                data: {
                    userId,
                    name: `${block.product} (${block.accountNumber})`,
                    accountType,
                    currency: block.currency,
                    owner: "child",
                    ownerLabel,
                },
            });
            account = { ...created, holdings: [] as any[] };
            (existingAccounts as any[]).push(account);
            result.accountsCreated++;
        } else {
            result.accountsUpdated++;
        }

        const fundAssets = block.assets.filter((a) => a.quantity !== null && a.quantity > 0 && !/^cash$/i.test(a.holdingName));

        if (fundAssets.length === 0) {
            result.pendingAccountNumbers.push(block.accountNumber);
            continue;
        }

        for (const asset of fundAssets) {
            // Every child account so far holds only this one fund -- match
            // by ticker/ISIN (stable across uploads) rather than Fidelity's
            // free-text asset name.
            const existingHolding = (account.holdings as any[]).find((h) => h.ticker === FIDELITY_CHILD_FUND_ISIN);
            const units = asset.quantity as number;
            const costBasis = asset.bookCostGBP ?? asset.valueGBP ?? 0;
            const currentValue = asset.valueGBP ?? costBasis;

            if (existingHolding) {
                await db.vanguardHolding.update({
                    where: { id: existingHolding.id },
                    data: { units, costBasis, currentValue, valueUpdatedAt: new Date() },
                });
                result.holdingsUpdated++;
            } else {
                await db.vanguardHolding.create({
                    data: {
                        userId,
                        accountId: account.id,
                        fundName: FIDELITY_CHILD_FUND_NAME,
                        ticker: FIDELITY_CHILD_FUND_ISIN,
                        units,
                        costBasis,
                        currentValue,
                    },
                });
                result.holdingsCreated++;
            }
        }
    }

    revalidatePath("/vanguard");
    revalidatePath("/investments");
    return result;
}

/** Same shape as listVanguardAccounts(), pre-serialized to plain
 * numbers/strings -- lets client components (e.g. after a CSV import)
 * refresh their local account list without duplicating the Decimal→number
 * mapping that page.tsx already does for the initial server render. */
export async function listVanguardAccountsSerialized() {
    const accounts = await listVanguardAccounts();
    return (accounts as any[]).map((a) => ({
        id: a.id as string,
        name: a.name as string,
        accountType: a.accountType as string | null,
        currency: a.currency as string,
        owner: a.owner as string,
        ownerLabel: a.ownerLabel as string | null,
        holdings: a.holdings.map((h: any) => ({
            id: h.id as string,
            fundName: h.fundName as string,
            ticker: h.ticker as string | null,
            units: h.units ? Number(h.units) : null,
            costBasis: Number(h.costBasis),
            currentValue: Number(h.currentValue),
            valueUpdatedAt: h.valueUpdatedAt.toISOString() as string,
        })),
    }));
}
