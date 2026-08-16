"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeReminderUrgency } from "@/lib/vehicles/stats";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface ReminderInput {
    title: string;
    type?: string;
    dueDate: string; // ISO date
    notes?: string;
    vehicleId?: string | null;
    documentId?: string | null;
}

export async function createReminder(input: ReminderInput) {
    const userId = await requireUserId();

    if (input.vehicleId) {
        const vehicle = await db.vehicle.findUnique({ where: { id: input.vehicleId } });
        if (!vehicle || vehicle.userId !== userId) throw new Error("Vehicle not found");
    }
    if (input.documentId) {
        const document = await db.document.findUnique({ where: { id: input.documentId } });
        if (!document || document.userId !== userId) throw new Error("Document not found");
    }

    const reminder = await db.reminder.create({
        data: {
            userId,
            title: input.title,
            type: input.type || null,
            dueDate: new Date(input.dueDate),
            notes: input.notes || null,
            vehicleId: input.vehicleId || null,
            documentId: input.documentId || null,
        },
    });
    revalidatePath("/reminders");
    return reminder;
}

export async function dismissReminder(id: string) {
    const userId = await requireUserId();
    const existing = await db.reminder.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const reminder = await db.reminder.update({
        where: { id },
        data: { isDismissed: true, dismissedAt: new Date() },
    });
    revalidatePath("/reminders");
    return reminder;
}

export async function reopenReminder(id: string) {
    const userId = await requireUserId();
    const existing = await db.reminder.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const reminder = await db.reminder.update({
        where: { id },
        data: { isDismissed: false, dismissedAt: null },
    });
    revalidatePath("/reminders");
    return reminder;
}

export async function deleteReminder(id: string) {
    const userId = await requireUserId();
    const existing = await db.reminder.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.reminder.delete({ where: { id } });
    revalidatePath("/reminders");
}

/** Reminders with a computed urgency (overdue/due_soon/upcoming), sorted
 * soonest-first. Dismissed reminders are included only when requested. */
export async function listReminders(includeDismissed: boolean = false) {
    const userId = await requireUserId();
    const reminders = await db.reminder.findMany({
        where: { userId, ...(includeDismissed ? {} : { isDismissed: false }) },
        orderBy: { dueDate: "asc" },
        include: { vehicle: true, document: true },
    });

    return reminders.map((r: any) => ({ ...r, urgency: computeReminderUrgency(r.dueDate) }));
}
