/**
 * Pure helpers for the personal/family Document module — no DB, no email,
 * no R2. Kept separate from lib/documents/lifecycle.ts (the vehicle-linked
 * Document vault) since the two modules evolve independently, even though
 * the red/amber/green thresholds happen to be the same.
 */

export type ExpiryStatus = "red" | "amber" | "green" | "none";

/** Same red(overdue)/amber(<=30 days)/green thresholds used everywhere else
 * in the app (vehicle documents, maintenance, reminders). */
export function computeExpiryStatus(expiryDate: Date | null, now: Date = new Date()): ExpiryStatus {
    if (!expiryDate) return "none";
    const daysUntil = (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    return daysUntil < 0 ? "red" : daysUntil <= 30 ? "amber" : "green";
}

export interface VersionLike {
    id: string;
    expiryDate: Date | null;
    createdAt: Date;
}

/**
 * Which version of a document is "active" — the one shown in the list and
 * used for expiry/reminder calculations. Whichever version has the LATEST
 * expiryDate wins (that's always the most recent renewal, regardless of
 * upload order); if none of the versions has an expiryDate, fall back to
 * whichever was uploaded most recently.
 */
export function pickActiveVersion<T extends VersionLike>(versions: T[]): T | null {
    if (versions.length === 0) return null;
    const withExpiry = versions.filter((v) => v.expiryDate);
    if (withExpiry.length > 0) {
        return withExpiry.reduce((latest, v) => (v.expiryDate! > latest.expiryDate! ? v : latest));
    }
    return [...versions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

/**
 * Whether a reminder email is due today, given how many days remain until
 * expiry (negative once the document is overdue). Cadence: one email at
 * T-30, then weekly (T-23, T-16, T-9), then daily from T-7 onward —
 * including every day after expiry, indefinitely, until the document is
 * updated (a new version resets `lastReminderSentAt` and re-evaluates
 * against the new expiryDate).
 */
export function shouldSendReminderToday(daysUntilExpiry: number): boolean {
    if (daysUntilExpiry <= 7) return true;
    if (daysUntilExpiry > 30) return false;
    return (30 - daysUntilExpiry) % 7 === 0;
}

/** Which cadence stage today's reminder (if any) belongs to — display-only,
 * used in the email subject/body. */
export function reminderStageLabel(daysUntilExpiry: number): "expired" | "final-week" | "monthly" {
    if (daysUntilExpiry < 0) return "expired";
    if (daysUntilExpiry <= 7) return "final-week";
    return "monthly";
}
