"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/core";
import { RefreshCcw } from "lucide-react";
import { refreshCachedPages } from "@/app/actions/page-cache";

export function DashboardRefreshButton() {
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        // Drop the cached page data (lib/page-cache), then re-render with fresh data
        await refreshCachedPages().catch(() => null);
        router.refresh();

        // Simulating artificial short delay purely for visual feedback 
        setTimeout(() => setIsRefreshing(false), 800);
    };

    return (
        <Button
            variant="outline"
            size="icon"
            className="rounded-2xl"
            onClick={handleRefresh}
            disabled={isRefreshing}
        >
            <RefreshCcw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
    );
}
