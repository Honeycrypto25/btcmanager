"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
    computeFuelStats,
    computeMaintenanceStatus,
    computeFuelPurchaseBuckets,
    computeDistanceBuckets,
    computeAverageDistanceRates,
    computePriceEvolution,
    computeSupplierRanking,
    type FuelPurchase,
} from "@/lib/vehicles/stats";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

// --- Vehicles ---

export interface VehicleInput {
    name: string;
    make?: string;
    model?: string;
    year?: number;
    registrationNumber?: string;
    fuelType?: string;
    currentMileage?: number;
    notes?: string;
}

export async function createVehicle(input: VehicleInput) {
    const userId = await requireUserId();
    const vehicle = await db.vehicle.create({
        data: {
            userId,
            name: input.name,
            make: input.make || null,
            model: input.model || null,
            year: input.year ?? null,
            registrationNumber: input.registrationNumber || null,
            fuelType: input.fuelType || null,
            currentMileage: input.currentMileage ?? null,
            notes: input.notes || null,
        },
    });
    revalidatePath("/vehicles");
    return vehicle;
}

export async function updateVehicle(id: string, input: VehicleInput) {
    const userId = await requireUserId();
    const existing = await db.vehicle.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const vehicle = await db.vehicle.update({
        where: { id },
        data: {
            name: input.name,
            make: input.make || null,
            model: input.model || null,
            year: input.year ?? null,
            registrationNumber: input.registrationNumber || null,
            fuelType: input.fuelType || null,
            currentMileage: input.currentMileage ?? null,
            notes: input.notes || null,
        },
    });
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${id}`);
    return vehicle;
}

export async function deleteVehicle(id: string) {
    const userId = await requireUserId();
    const existing = await db.vehicle.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.vehicle.delete({ where: { id } }); // cascades fuel/maintenance records; documents/reminders are set null
    revalidatePath("/vehicles");
}

export async function listVehicles() {
    const userId = await requireUserId();
    return db.vehicle.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function getVehicle(id: string) {
    const userId = await requireUserId();
    const vehicle = await db.vehicle.findUnique({ where: { id } });
    if (!vehicle || vehicle.userId !== userId) throw new Error("Not found");
    return vehicle;
}

// --- Fuel entries ---

export interface FuelEntryInput {
    vehicleId: string;
    date: string; // ISO date
    mileage?: number;
    quantity: number;
    unit?: string;
    cost: number;
    pricePerUnit?: number;
    isFullTank?: boolean;
    station?: string;
    notes?: string;
}

async function requireOwnedVehicle(userId: string, vehicleId: string) {
    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.userId !== userId) throw new Error("Vehicle not found");
    return vehicle;
}

export async function createFuelEntry(input: FuelEntryInput) {
    const userId = await requireUserId();
    await requireOwnedVehicle(userId, input.vehicleId);

    const entry = await db.fuelEntry.create({
        data: {
            userId,
            vehicleId: input.vehicleId,
            date: new Date(input.date),
            mileage: input.mileage ?? null,
            quantity: input.quantity,
            unit: input.unit || "litres",
            cost: input.cost,
            pricePerUnit: input.pricePerUnit ?? null,
            isFullTank: input.isFullTank ?? true,
            station: input.station || null,
            notes: input.notes || null,
        },
    });

    // Keep the vehicle's currentMileage in sync with the latest reading.
    if (input.mileage) {
        const vehicle = await db.vehicle.findUnique({ where: { id: input.vehicleId } });
        if (vehicle && (vehicle.currentMileage ?? 0) < input.mileage) {
            await db.vehicle.update({ where: { id: input.vehicleId }, data: { currentMileage: input.mileage } });
        }
    }

    revalidatePath(`/vehicles/${input.vehicleId}`);
    return entry;
}

export async function deleteFuelEntry(id: string) {
    const userId = await requireUserId();
    const existing = await db.fuelEntry.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.fuelEntry.delete({ where: { id } });
    revalidatePath(`/vehicles/${existing.vehicleId}`);
}

export async function listFuelEntries(vehicleId: string) {
    const userId = await requireUserId();
    await requireOwnedVehicle(userId, vehicleId);
    return db.fuelEntry.findMany({ where: { userId, vehicleId }, orderBy: { date: "desc" } });
}

/** Fuel entries + MPG/cost-per-mile stats computed between consecutive
 * full-tank fill-ups. Also pulls in receipts linked to this vehicle with
 * mileage + litres set (e.g. fuel paid in cash, which never appears in a
 * bank statement and so has no other way into this calculation) and feeds
 * them into the same combined, mileage-sorted sequence as the fuel journal
 * — computeFuelStats doesn't care which table a reading came from. */
/** Shared entries+receipts merge used by both getFuelStats and
 * getVehicleAnalytics -- keeps the "which table did this fill-up come
 * from" logic in exactly one place. */
async function getCombinedFuelPurchases(userId: string, vehicleId: string): Promise<{ entries: any[]; fuelReceipts: any[]; purchases: FuelPurchase[] }> {
    const [entries, fuelReceipts] = await Promise.all([
        db.fuelEntry.findMany({ where: { userId, vehicleId }, orderBy: { date: "asc" } }),
        db.receipt.findMany({
            where: { userId, vehicleId, vehicleMileage: { not: null }, fuelQuantityLitres: { not: null } },
            orderBy: { receiptDate: "asc" },
        }),
    ]);

    const purchases: FuelPurchase[] = [
        ...entries.map((e: any) => ({
            id: e.id,
            date: e.date,
            mileage: e.mileage,
            quantity: Number(e.quantity),
            cost: Number(e.cost),
            pricePerUnit: e.pricePerUnit !== null ? Number(e.pricePerUnit) : null,
            isFullTank: e.isFullTank,
            station: e.station,
        })),
        ...fuelReceipts.map((r: any) => ({
            id: r.id,
            date: r.receiptDate || r.createdAt,
            mileage: r.vehicleMileage,
            quantity: Number(r.fuelQuantityLitres),
            cost: r.amount !== null ? Number(r.amount) : 0,
            pricePerUnit: null,
            isFullTank: !!r.isFullTank,
            station: r.merchant,
        })),
    ];

    return { entries, fuelReceipts, purchases };
}

export async function getFuelStats(vehicleId: string) {
    const userId = await requireUserId();
    await requireOwnedVehicle(userId, vehicleId);
    const { entries, fuelReceipts, purchases } = await getCombinedFuelPurchases(userId, vehicleId);

    const stats = computeFuelStats(purchases);

    return { entries: entries.reverse(), fuelReceipts, stats };
}

/** Consolidated analytics for the vehicle's "Statistici" tab: weekly/
 * monthly fuel + distance buckets, average distance rates, fuel price
 * evolution, and cheapest-supplier ranking. All derived from the same
 * combined fuel-entries + linked-receipts purchase list as getFuelStats. */
export async function getVehicleAnalytics(vehicleId: string) {
    const userId = await requireUserId();
    await requireOwnedVehicle(userId, vehicleId);
    const { purchases } = await getCombinedFuelPurchases(userId, vehicleId);

    return {
        consumptionSeries: computeFuelStats(purchases),
        weeklyFuel: computeFuelPurchaseBuckets(purchases, "week"),
        monthlyFuel: computeFuelPurchaseBuckets(purchases, "month"),
        weeklyDistance: computeDistanceBuckets(purchases, "week"),
        monthlyDistance: computeDistanceBuckets(purchases, "month"),
        averageDistance: computeAverageDistanceRates(purchases),
        priceEvolution: computePriceEvolution(purchases),
        cheapestSuppliers: computeSupplierRanking(purchases),
    };
}

// --- Maintenance ---

export interface MaintenanceInput {
    vehicleId: string;
    type: string;
    date: string; // ISO date
    mileage?: number;
    cost?: number;
    provider?: string;
    notes?: string;
    nextDueDate?: string;
    nextDueMileage?: number;
}

export async function createMaintenanceRecord(input: MaintenanceInput) {
    const userId = await requireUserId();
    await requireOwnedVehicle(userId, input.vehicleId);

    const record = await db.maintenanceRecord.create({
        data: {
            userId,
            vehicleId: input.vehicleId,
            type: input.type,
            date: new Date(input.date),
            mileage: input.mileage ?? null,
            cost: input.cost ?? null,
            provider: input.provider || null,
            notes: input.notes || null,
            nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : null,
            nextDueMileage: input.nextDueMileage ?? null,
        },
    });
    revalidatePath(`/vehicles/${input.vehicleId}`);
    return record;
}

export async function deleteMaintenanceRecord(id: string) {
    const userId = await requireUserId();
    const existing = await db.maintenanceRecord.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await db.maintenanceRecord.delete({ where: { id } });
    revalidatePath(`/vehicles/${existing.vehicleId}`);
}

/** Maintenance records + green/amber/red status computed from nextDueDate/nextDueMileage. */
export async function getMaintenanceWithStatus(vehicleId: string) {
    const userId = await requireUserId();
    const vehicle = await requireOwnedVehicle(userId, vehicleId);
    const records = await db.maintenanceRecord.findMany({ where: { userId, vehicleId }, orderBy: { date: "desc" } });

    return records.map((r: any) => ({
        ...r,
        status: computeMaintenanceStatus({
            nextDueDate: r.nextDueDate,
            nextDueMileage: r.nextDueMileage,
            currentMileage: vehicle.currentMileage,
        }),
    }));
}

/** Worst-case status across all maintenance records for a vehicle — used for the vehicle list badge. */
export async function getVehicleOverallStatus(vehicleId: string) {
    const items = await getMaintenanceWithStatus(vehicleId);
    const severity: Record<string, number> = { none: -1, green: 0, amber: 1, red: 2 };
    let worst = "none";
    for (const item of items) {
        if (severity[item.status] > severity[worst]) worst = item.status;
    }
    return worst;
}
