"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/core";
import { RefreshCw, Loader2 } from "lucide-react";
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useIsAdmin } from "@/hooks/useIsAdmin";

export function T212SyncButton() {
    const router = useRouter();
    const isAdmin = useIsAdmin();
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSync = async () => {
        setSyncing(true);
        setError(null);
        try {
            await axios.post('/api/t212/sync');
            router.refresh();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    if (!isAdmin) return null;

    return (
        <div className="flex flex-col items-end gap-1.5">
            <Button variant="outline" size="md" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sync now
            </Button>
            {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
    );
}
