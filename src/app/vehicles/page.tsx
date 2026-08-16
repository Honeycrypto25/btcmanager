export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listVehicles, getVehicleOverallStatus } from "@/app/actions/vehicles";
import { VehiclesClient } from "@/components/vehicles/VehiclesClient";

export default async function VehiclesPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const vehicles = await listVehicles();
    const withStatus = await Promise.all(
        vehicles.map(async (v: any) => ({
            id: v.id,
            name: v.name,
            make: v.make,
            model: v.model,
            year: v.year,
            registrationNumber: v.registrationNumber,
            fuelType: v.fuelType,
            currentMileage: v.currentMileage,
            maintenanceStatus: await getVehicleOverallStatus(v.id),
        }))
    );

    return (
        <DashboardLayout>
            <VehiclesClient initialVehicles={withStatus} />
        </DashboardLayout>
    );
}
