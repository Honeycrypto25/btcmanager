"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROADMAP } from "@/lib/dev-roadmap";

async function requireAuth() {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");
}

/** Seeds DevTask rows from the static roadmap the first time the table is empty.
 * Safe to call repeatedly — it only inserts entries that don't exist yet
 * (matched by phase+section+title), so re-deploys never duplicate rows or
 * wipe out status changes made in the UI. */
export async function ensureRoadmapSeeded() {
    await requireAuth();

    const existing = await db.devTask.findMany({ select: { phase: true, section: true, title: true } });
    const existingKeys = new Set(existing.map((t: any) => `${t.phase}::${t.section}::${t.title}`));

    const toCreate = ROADMAP.filter(
        (item) => !existingKeys.has(`${item.phase}::${item.section}::${item.title}`)
    );

    if (toCreate.length > 0) {
        await db.devTask.createMany({
            data: toCreate.map((item, idx) => ({
                phase: item.phase,
                section: item.section,
                title: item.title,
                description: item.description ?? null,
                order: idx,
                status: item.doneOnSeed ? "DONE" : "PLANNED",
                completedAt: item.doneOnSeed ? new Date() : null,
            })),
        });
    }
}

export async function listDevTasks() {
    await requireAuth();
    return db.devTask.findMany({ orderBy: [{ phase: "asc" }, { order: "asc" }] });
}

export async function setDevTaskStatus(id: string, status: "PLANNED" | "IN_PROGRESS" | "DONE") {
    await requireAuth();
    const task = await db.devTask.update({
        where: { id },
        data: {
            status,
            completedAt: status === "DONE" ? new Date() : null,
        },
    });
    revalidatePath("/tasks");
    return task;
}
