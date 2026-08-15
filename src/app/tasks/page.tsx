export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ensureRoadmapSeeded, listDevTasks } from "@/app/actions/dev-tasks";
import { TasksClient } from "@/components/tasks/TasksClient";

export default async function TasksPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    await ensureRoadmapSeeded();
    const tasks = await listDevTasks();

    const serialized = tasks.map((t: any) => ({
        id: t.id,
        phase: t.phase,
        section: t.section,
        title: t.title,
        description: t.description,
        status: t.status,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    }));

    return (
        <DashboardLayout>
            <TasksClient initialTasks={serialized} />
        </DashboardLayout>
    );
}
