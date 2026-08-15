export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getVehicle, getFuelStats, getMaintenanceWithStatus } from "@/app/actions/vehicles";
import { listDocuments } from "@/app/actions/documents";
import { VehicleDetailClient } from "@/components/vehicles/VehicleDetailClient";

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const { id } = await params;

    let vehicle;
    try {
        vehicle = await getVehicle(id);
    } catch {
        notFound();
    }

    const [{ entries, stats }, maintenance, documents] = await Promise.all([
        getFuelStats(id),
        getMaintenanceWithStatus(id),
        listDocuments({ vehicleId: id }),
    ]);

    const serialized = {
        vehicle: {
            id: vehicle!.id,
            name: vehicle!.name,
            make: vehicle!.make,
            model: vehicle!.model,
            year: vehicle!.year,
            registrationNumber: vehicle!.registrationNumber,
            fuelType: vehicle!.fuelType,
            currentMileage: vehicle!.currentMileage,
            notes: vehicle!.notes,
        },
        fuelEntries: entries.map((e: any) => ({
            id: e.id,
            date: e.date.toISOString(),
            mileage: e.mileage,
            quantity: Number(e.quantity),
            unit: e.unit,
            cost: Number(e.cost),
            pricePerUnit: e.pricePerUnit ? Number(e.pricePerUnit) : null,
            isFullTank: e.isFullTank,
            station: e.station,
        })),
        fuelStats: stats,
        maintenance: maintenance.map((m: any) => ({
            id: m.id,
            type: m.type,
            date: m.date.toISOString(),
            mileage: m.mileage,
            cost: m.cost ? Number(m.cost) : null,
            provider: m.provider,
            nextDueDate: m.nextDueDate ? m.nextDueDate.toISOString() : null,
            nextDueMileage: m.nextDueMileage,
            status: m.status,
        })),
        documents: documents.map((d: any) => ({
            id: d.id,
            category: d.category,
            title: d.title,
            expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
            createdAt: d.createdAt.toISOString(),
        })),
    };

    return (
        <DashboardLayout>
            <VehicleDetailClient data={serialized} />
        </DashboardLayout>
    );
}
