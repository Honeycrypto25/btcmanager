"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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
}

export async function createVanguardAccount(input: VanguardAccountInput) {
    const userId = await requireUserId();
    const account = await db.vanguardAccount.create({
        data: { userId, name: input.name, accountType: input.accountType || null, currency: input.currency || "GBP" },
    });
    revalidatePath("/vanguard");
    revalidatePath("/investments");
    return account;
}

export async function deleteVanguardAccount(id: string) {
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

async function requireOwnedAccount(userId: string, accountId: string) {
    const account = await db.vanguardAccount.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) throw new Error("Vanguard account not found");
    return account;
}

export async function createVanguardHolding(input: VanguardHoldingInput) {
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
    const userId = await requireUserId();
    const existing = await db.vanguardHolding.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.vanguardHolding.delete({ where: { id } });
    revalidatePath("/vanguard");
    revalidatePath("/investments");
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
