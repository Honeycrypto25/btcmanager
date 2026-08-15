"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui/core";

interface TaxYearSelectorProps {
    taxYears: string[];
    selected: string;
    basePath: string; // e.g. "/self-employed" — appends ?taxYear=
}

export function TaxYearSelector({ taxYears, selected, basePath }: TaxYearSelectorProps) {
    const router = useRouter();

    return (
        <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1">
            {taxYears.map((year) => (
                <button
                    key={year}
                    onClick={() => router.push(`${basePath}?taxYear=${year}`)}
                    className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        year === selected
                            ? "bg-primary text-black"
                            : "text-muted hover:bg-white/5 hover:text-foreground"
                    )}
                >
                    {year}
                </button>
            ))}
        </div>
    );
}
