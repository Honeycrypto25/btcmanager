"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { cn } from "@/components/ui/core";
import { refreshCachedPages } from "@/app/actions/page-cache";

/**
 * Pages are cached (lib/page-cache) and only rebuilt after a change, a bot run, or this button:
 * it drops the cache and reloads the current page with fresh data.
 */
export function PageRefreshButton({ className }: { className?: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <button
            type="button"
            onClick={() =>
                start(async () => {
                    await refreshCachedPages().catch(() => null);
                    router.refresh();
                })
            }
            disabled={pending}
            title="Reîmprospătează datele — paginile sunt păstrate în memorie până la o modificare, o rulare a boților sau acest buton"
            aria-label="Reîmprospătează datele"
            className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-60",
                className,
            )}
        >
            <RefreshCcw className={cn("h-4 w-4", pending && "animate-spin")} />
        </button>
    );
}
