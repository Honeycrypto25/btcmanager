/** Placed → executed timing shown in the lot tables. */
export function lotTiming(placedAt: string | Date | null | undefined, executedAt: string | Date | null | undefined) {
    const placed = placedAt ? new Date(placedAt) : null;
    const executed = executedAt ? new Date(executedAt) : null;
    let days: number | null = null;
    if (placed && executed) days = Math.max(0, (executed.getTime() - placed.getTime()) / 86_400_000);
    return { placed, executed, days };
}

export function fmtLotDate(d: Date | null): string {
    return d ? d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

/** "3.4 zile" / "< 1 zi" / "—". */
export function fmtLotDays(days: number | null): string {
    if (days === null) return "—";
    if (days < 1) return "< 1 zi";
    return `${days.toFixed(1)} zile`;
}
