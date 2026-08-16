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

export interface GoalInput {
    title: string;
    category?: string;
    targetAmount: number;
    currentAmount?: number;
    currency?: string;
    targetDate?: string; // ISO date
    notes?: string;
}

export async function createGoal(input: GoalInput) {
    const userId = await requireUserId();
    const goal = await db.financialGoal.create({
        data: {
            userId,
            title: input.title,
            category: input.category || null,
            targetAmount: input.targetAmount,
            currentAmount: input.currentAmount ?? 0,
            currency: input.currency || "GBP",
            targetDate: input.targetDate ? new Date(input.targetDate) : null,
            notes: input.notes || null,
        },
    });
    revalidatePath("/goals");
    return goal;
}

/** Updates progress (currentAmount) — the routine "log my progress" action.
 * Auto-marks isAchieved when currentAmount reaches targetAmount. */
export async function updateGoalProgress(id: string, currentAmount: number) {
    const userId = await requireUserId();
    const existing = await db.financialGoal.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const goal = await db.financialGoal.update({
        where: { id },
        data: { currentAmount, isAchieved: currentAmount >= Number(existing.targetAmount) },
    });
    revalidatePath("/goals");
    return goal;
}

export async function updateGoal(id: string, input: GoalInput) {
    const userId = await requireUserId();
    const existing = await db.financialGoal.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const goal = await db.financialGoal.update({
        where: { id },
        data: {
            title: input.title,
            category: input.category || null,
            targetAmount: input.targetAmount,
            currentAmount: input.currentAmount ?? existing.currentAmount,
            currency: input.currency || existing.currency,
            targetDate: input.targetDate ? new Date(input.targetDate) : null,
            notes: input.notes || null,
        },
    });
    revalidatePath("/goals");
    return goal;
}

export async function deleteGoal(id: string) {
    const userId = await requireUserId();
    const existing = await db.financialGoal.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.financialGoal.delete({ where: { id } });
    revalidatePath("/goals");
}

export async function listGoals() {
    const userId = await requireUserId();
    return db.financialGoal.findMany({ where: { userId }, orderBy: [{ isAchieved: "asc" }, { targetDate: "asc" }] });
}
