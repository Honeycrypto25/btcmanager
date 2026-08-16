export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listGoals } from "@/app/actions/goals";
import { GoalsClient } from "@/components/vanguard/GoalsClient";

export default async function GoalsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const goals = await listGoals();

    const serialized = goals.map((g: any) => ({
        id: g.id,
        title: g.title,
        category: g.category,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        currency: g.currency,
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        notes: g.notes,
        isAchieved: g.isAchieved,
    }));

    return (
        <DashboardLayout>
            <GoalsClient initialGoals={serialized} />
        </DashboardLayout>
    );
}
