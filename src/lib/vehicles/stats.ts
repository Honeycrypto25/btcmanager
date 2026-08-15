/**
 * Pure calculation helpers for the Vehicles module (Phase 5). No DB access.
 */

export interface FuelEntryLike {
    id: string;
    date: Date;
    mileage: number | null;
    quantity: number; // litres
    cost: number;
    isFullTank: boolean;
}

export interface FuelSegmentStat {
    entryId: string;
    distanceMiles: number;
    litresUsed: number;
    cost: number;
    mpg: number;
    costPerMile: number;
}

const LITRES_TO_UK_GALLONS = 0.219969;

/**
 * MPG/cost-per-mile can only be computed between two consecutive FULL-tank
 * fill-ups (a partial fill breaks the "litres used since last full tank"
 * math). Fuel used between two full fill-ups is the sum of every entry's
 * quantity in that window (including any partial fills in between).
 */
export function computeFuelStats(entries: FuelEntryLike[]): FuelSegmentStat[] {
    const sorted = [...entries]
        .filter((e) => e.mileage !== null)
        .sort((a, b) => (a.mileage as number) - (b.mileage as number));

    const results: FuelSegmentStat[] = [];
    let litresAcc = 0;
    let costAcc = 0;
    let lastFullMileage: number | null = null;

    for (const e of sorted) {
        litresAcc += e.quantity;
        costAcc += e.cost;

        if (e.isFullTank) {
            if (lastFullMileage !== null) {
                const distanceMiles = (e.mileage as number) - lastFullMileage;
                if (distanceMiles > 0 && litresAcc > 0) {
                    const gallons = litresAcc * LITRES_TO_UK_GALLONS;
                    results.push({
                        entryId: e.id,
                        distanceMiles,
                        litresUsed: litresAcc,
                        cost: costAcc,
                        mpg: gallons > 0 ? distanceMiles / gallons : 0,
                        costPerMile: costAcc / distanceMiles,
                    });
                }
            }
            lastFullMileage = e.mileage as number;
            litresAcc = 0;
            costAcc = 0;
        }
    }

    return results;
}

export type MaintenanceStatus = "red" | "amber" | "green" | "none";

/**
 * Green/amber/red status for a maintenance item, from whichever of
 * nextDueDate / nextDueMileage is more urgent. "none" means no due date
 * or mileage was set (nothing to warn about yet).
 */
export function computeMaintenanceStatus(params: {
    nextDueDate: Date | null;
    nextDueMileage: number | null;
    currentMileage: number | null;
    now?: Date;
}): MaintenanceStatus {
    const { nextDueDate, nextDueMileage, currentMileage, now = new Date() } = params;

    let dateStatus: MaintenanceStatus = "none";
    if (nextDueDate) {
        const daysUntil = (nextDueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
        dateStatus = daysUntil < 0 ? "red" : daysUntil <= 30 ? "amber" : "green";
    }

    let mileageStatus: MaintenanceStatus = "none";
    if (nextDueMileage !== null && currentMileage !== null) {
        const milesUntil = nextDueMileage - currentMileage;
        mileageStatus = milesUntil < 0 ? "red" : milesUntil <= 500 ? "amber" : "green";
    }

    const severity: Record<MaintenanceStatus, number> = { none: -1, green: 0, amber: 1, red: 2 };
    return severity[dateStatus] >= severity[mileageStatus] ? dateStatus : mileageStatus;
}

export type ReminderUrgency = "overdue" | "due_soon" | "upcoming";

export function computeReminderUrgency(dueDate: Date, now: Date = new Date()): ReminderUrgency {
    const daysUntil = (dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysUntil < 0) return "overdue";
    if (daysUntil <= 30) return "due_soon";
    return "upcoming";
}
