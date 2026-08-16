/**
 * Pure calculation helpers for the Vehicles module (Phase 5). No DB access.
 */

import { startOfWeek, startOfMonth, format } from "date-fns";

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
    date: Date; // date of the full-tank fill-up that closes this segment
    distanceMiles: number;
    litresUsed: number;
    cost: number;
    mpg: number;
    costPerMile: number;
}

const LITRES_TO_UK_GALLONS = 0.219969;
const MILES_TO_KM = 1.609344;
// L/100km = (litres per gallon) x 100 / (miles per gallon x km per mile)
const MPG_TO_L100KM_CONSTANT = 4.54609 * 100; // UK (imperial) gallon in litres

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
                        date: e.date,
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

// --- Unit conversion (MPG <-> L/100km toggle) ---

export function mpgToL100km(mpg: number): number {
    if (!mpg || mpg <= 0) return 0;
    return MPG_TO_L100KM_CONSTANT / (mpg * MILES_TO_KM);
}

export function costPerMileToCostPerKm(costPerMile: number): number {
    return costPerMile / MILES_TO_KM;
}

export function milesToKm(miles: number): number {
    return miles * MILES_TO_KM;
}

// --- Analytics: weekly/monthly consumption, distance, price trends ---

export interface FuelPurchase {
    id: string;
    date: Date;
    mileage: number | null;
    quantity: number; // litres
    cost: number;
    pricePerUnit: number | null; // GBP/litre; derived from cost/quantity if not provided
    isFullTank: boolean;
    station: string | null;
}

export interface PeriodBucket {
    label: string; // e.g. "12 Aug 2026" (week start) or "Aug 2026"
    periodStart: Date;
    totalLitres: number;
    totalCost: number;
}

/** Groups raw fuel purchases (every entry, not just full-tank ones) into
 * calendar week or month buckets — this is "how much fuel/money per
 * week/month", independent of the full-tank-segment MPG math above. */
export function computeFuelPurchaseBuckets(purchases: FuelPurchase[], period: "week" | "month"): PeriodBucket[] {
    const buckets = new Map<string, PeriodBucket>();

    for (const p of purchases) {
        const periodStart = period === "week" ? startOfWeek(p.date, { weekStartsOn: 1 }) : startOfMonth(p.date);
        const key = periodStart.toISOString();
        const label = period === "week" ? format(periodStart, "dd MMM") : format(periodStart, "MMM yyyy");
        const existing = buckets.get(key);
        if (existing) {
            existing.totalLitres += p.quantity;
            existing.totalCost += p.cost;
        } else {
            buckets.set(key, { label, periodStart, totalLitres: p.quantity, totalCost: p.cost });
        }
    }

    return [...buckets.values()].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
}

export interface DistanceBucket {
    label: string;
    periodStart: Date;
    distanceMiles: number;
}

/** Distance covered per calendar week/month, from consecutive mileage
 * readings (fuel entries + linked receipts, anything with mileage set).
 * Each interval's distance is attributed to the bucket of its LATER
 * reading's date -- a simple, honest approximation given readings only
 * exist at fill-up points, not continuously. */
export function computeDistanceBuckets(purchases: FuelPurchase[], period: "week" | "month"): DistanceBucket[] {
    const withMileage = purchases
        .filter((p) => p.mileage !== null)
        .sort((a, b) => (a.mileage as number) - (b.mileage as number));

    const buckets = new Map<string, DistanceBucket>();

    for (let i = 1; i < withMileage.length; i++) {
        const prev = withMileage[i - 1];
        const curr = withMileage[i];
        const distance = (curr.mileage as number) - (prev.mileage as number);
        if (distance <= 0) continue;

        const periodStart = period === "week" ? startOfWeek(curr.date, { weekStartsOn: 1 }) : startOfMonth(curr.date);
        const key = periodStart.toISOString();
        const label = period === "week" ? format(periodStart, "dd MMM") : format(periodStart, "MMM yyyy");
        const existing = buckets.get(key);
        if (existing) {
            existing.distanceMiles += distance;
        } else {
            buckets.set(key, { label, periodStart, distanceMiles: distance });
        }
    }

    return [...buckets.values()].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
}

export interface AverageDistanceRates {
    perDayMiles: number;
    perWeekMiles: number;
    perMonthMiles: number;
    perYearMiles: number;
    perDayKm: number;
    perWeekKm: number;
    perMonthKm: number;
    perYearKm: number;
}

/** Average distance driven per day/week/month/year, from the earliest to
 * the latest mileage reading -- a straight-line average, not smoothed. */
export function computeAverageDistanceRates(purchases: FuelPurchase[]): AverageDistanceRates | null {
    const withMileage = purchases
        .filter((p) => p.mileage !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (withMileage.length < 2) return null;

    const first = withMileage[0];
    const last = withMileage[withMileage.length - 1];
    const totalMiles = (last.mileage as number) - (first.mileage as number);
    const totalDays = (last.date.getTime() - first.date.getTime()) / (24 * 60 * 60 * 1000);
    if (totalMiles <= 0 || totalDays <= 0) return null;

    const perDayMiles = totalMiles / totalDays;
    return {
        perDayMiles,
        perWeekMiles: perDayMiles * 7,
        perMonthMiles: perDayMiles * 30.4368,
        perYearMiles: perDayMiles * 365.2425,
        perDayKm: perDayMiles * MILES_TO_KM,
        perWeekKm: perDayMiles * 7 * MILES_TO_KM,
        perMonthKm: perDayMiles * 30.4368 * MILES_TO_KM,
        perYearKm: perDayMiles * 365.2425 * MILES_TO_KM,
    };
}

export interface PricePoint {
    date: Date;
    pricePerLitre: number;
    station: string | null;
}

/** Price paid per litre over time, one point per purchase (not bucketed —
 * fuel price is naturally per-fill-up, not a period aggregate). */
export function computePriceEvolution(purchases: FuelPurchase[]): PricePoint[] {
    return purchases
        .filter((p) => p.quantity > 0)
        .map((p) => ({
            date: p.date,
            pricePerLitre: p.pricePerUnit ?? p.cost / p.quantity,
            station: p.station,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface SupplierPriceRow {
    station: string;
    avgPricePerLitre: number;
    fillCount: number;
}

/** Ranks fuel stations/merchants by average price per litre paid there,
 * cheapest first -- only stations with a name are counted. */
export function computeSupplierRanking(purchases: FuelPurchase[]): SupplierPriceRow[] {
    const groups = new Map<string, { total: number; count: number }>();

    for (const p of purchases) {
        const station = p.station?.trim();
        if (!station || p.quantity <= 0) continue;
        const price = p.pricePerUnit ?? p.cost / p.quantity;
        const existing = groups.get(station);
        if (existing) {
            existing.total += price;
            existing.count += 1;
        } else {
            groups.set(station, { total: price, count: 1 });
        }
    }

    return [...groups.entries()]
        .map(([station, { total, count }]) => ({ station, avgPricePerLitre: total / count, fillCount: count }))
        .sort((a, b) => a.avgPricePerLitre - b.avgPricePerLitre);
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
