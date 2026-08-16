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

/** Seeds DevTask rows from the static roadmap the first time the table is empty,
 * and syncs completion status forward for existing rows.
 * Safe to call repeatedly — it only inserts entries that don't exist yet
 * (matched by phase+section+title), so re-deploys never duplicate rows.
 *
 * Forward-sync: if an item is flagged `doneOnSeed: true` in the roadmap file
 * (meaning the feature has since been implemented) but its existing DB row
 * isn't DONE yet, it gets moved to DONE here. This only ever moves a row
 * PLANNED/IN_PROGRESS -> DONE — it never reverts a DONE row, and never
 * touches rows for items that aren't flagged doneOnSeed — so it can't undo
 * a manual status change made from the UI. */
export async function ensureRoadmapSeeded() {
    await requireAuth();

    const existing = await db.devTask.findMany({ select: { id: true, phase: true, section: true, title: true, status: true } });
    const existingByKey = new Map<string, { id: string; status: string }>(
        existing.map((t: any) => [`${t.phase}::${t.section}::${t.title}`, { id: t.id, status: t.status }])
    );

    const toCreate = ROADMAP.filter(
        (item) => !existingByKey.has(`${item.phase}::${item.section}::${item.title}`)
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

    const toMarkDone = ROADMAP.filter((item) => {
        if (!item.doneOnSeed) return false;
        const row = existingByKey.get(`${item.phase}::${item.section}::${item.title}`);
        return row && row.status !== "DONE";
    });

    for (const item of toMarkDone) {
        const row = existingByKey.get(`${item.phase}::${item.section}::${item.title}`)!;
        await db.devTask.update({
            where: { id: row.id },
            data: { status: "DONE", completedAt: new Date() },
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
