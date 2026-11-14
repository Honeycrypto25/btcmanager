"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/core";

interface Props {
    title: string;
    description?: React.ReactNode;
    /** Extra controls shown next to the expand button (e.g. a toggle). Receives the expanded state. */
    headerExtra?: (expanded: boolean) => React.ReactNode;
    /** Body — receives `expanded` so charts can grow to fill the screen. */
    children: (expanded: boolean) => React.ReactNode;
}

/**
 * Card with a "maximize" button. Expanded, the SAME card is lifted over the page as a
 * full-screen pop-up (no second copy of the chart is mounted, so canvas/refs keep working).
 * Closes with the X button, Escape, or a click on the dark backdrop.
 */
export function ExpandableCard({ title, description, headerExtra, children }: Props) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open]);

    return (
        <>
            {open && <div className="fixed inset-0 z-[60] bg-black/80" onClick={() => setOpen(false)} aria-hidden />}
            <Card
                className={open ? "fixed inset-2 z-[70] flex flex-col overflow-auto sm:inset-5" : undefined}
                style={open ? { background: "#0d0f14" } : undefined}
                role={open ? "dialog" : undefined}
                aria-modal={open || undefined}
                aria-label={open ? title : undefined}
            >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-medium text-foreground">{title}</h2>
                        {description && <div className="text-xs text-muted">{description}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                        {headerExtra?.(open)}
                        <button
                            type="button"
                            onClick={() => setOpen((o) => !o)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground"
                            title={open ? "Închide (Esc)" : "Mărește pe tot ecranul"}
                        >
                            {open ? (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                                    Închide
                                </>
                            ) : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                                    Mărește
                                </>
                            )}
                        </button>
                    </div>
                </div>
                <div className={open ? "flex min-h-0 flex-1 flex-col" : undefined}>{children(open)}</div>
            </Card>
        </>
    );
}
