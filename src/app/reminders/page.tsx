export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listReminders } from "@/app/actions/reminders";
import { listVehicles } from "@/app/actions/vehicles";
import { RemindersClient } from "@/components/vehicles/RemindersClient";

export default async function RemindersPage() {
    const session = await requireSectionAccess("vehicles");

    const [reminders, vehicles] = await Promise.all([listReminders(true), listVehicles()]);

    const serialized = reminders.map((r: any) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        dueDate: r.dueDate.toISOString(),
        notes: r.notes,
        vehicleId: r.vehicleId,
        vehicleName: r.vehicle?.name || null,
        isDismissed: r.isDismissed,
        urgency: r.urgency,
    }));

    const vehicleOptions = vehicles.map((v: any) => ({ id: v.id, name: v.name }));

    return (
        <DashboardLayout>
            <RemindersClient initialReminders={serialized} vehicles={vehicleOptions} />
        </DashboardLayout>
    );
}
