/**
 * Safe lifecycle status for a Document — purely informational (see the
 * comment on Document.retentionUntil in prisma/schema.prisma). Nothing in
 * this file ever deletes anything; it just computes what to show the user
 * so they can decide whether to keep or manually remove a document.
 */

export type ExpiryStatus = "red" | "amber" | "green" | "none";

/** Same red(overdue)/amber(<=30 days)/green thresholds already used for
 * vehicle maintenance and reminders (lib/vehicles/stats.ts), applied here
 * to a document's expiryDate (MOT certificate, insurance policy, etc.). */
export function computeExpiryStatus(expiryDate: Date | null, now: Date = new Date()): ExpiryStatus {
    if (!expiryDate) return "none";
    const daysUntil = (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    return daysUntil < 0 ? "red" : daysUntil <= 30 ? "amber" : "green";
}

/** True once "now" is past the document's retentionUntil date — flags it as
 * eligible for the user to review/delete, never triggers deletion itself. */
export function isPastRetention(retentionUntil: Date | null, now: Date = new Date()): boolean {
    if (!retentionUntil) return false;
    return retentionUntil.getTime() < now.getTime();
}
