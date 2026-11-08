"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/core";
import { refreshLoansPage } from "@/app/actions/lend";

/** Reloads the data of this page only — scroll position and chart selections stay as they are. */
export function LoansRefreshButton() {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
                start(async () => {
                    try {
                        await refreshLoansPage();
                    } finally {
                        router.refresh();
                    }
                })
            }
            aria-label="Reîmprospătează datele paginii"
        >
            <RefreshCw className={pending ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} />
            {pending ? "Se actualizează…" : "Actualizează"}
        </Button>
    );
}
