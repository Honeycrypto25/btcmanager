"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/core";
import { RefreshCw, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/** Manually triggers the ETF/OEIC price sync (see /api/vanguard/sync) --
 * only affects holdings that have both a ticker/ISIN and a unit count set;
 * everything else stays as-is. Mirrors T212SyncButton.tsx. */
export function VanguardSyncButton({ onSynced }: { onSynced?: () => void }) {
    const router = useRouter();
    const isAdmin = useIsAdmin();
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSync = async () => {
        setSyncing(true);
        setError(null);
        setMessage(null);
        try {
            const res = await axios.post("/api/vanguard/sync");
            const { updated, failed, total } = res.data;
            if (total === 0) {
                setMessage("Niciun holding cu ticker/ISIN + unități completate.");
            } else {
                setMessage(`${updated} actualizate${failed > 0 ? `, ${failed} eșuate` : ""} din ${total}.`);
            }
            router.refresh();
            onSynced?.();
        } catch (err: any) {
            setError(err.response?.data?.error || "Sincronizarea a eșuat.");
        } finally {
            setSyncing(false);
        }
    };

    if (!isAdmin) return null;

    return (
        <div className="flex flex-col items-end gap-1.5">
            <Button variant="outline" size="md" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sincronizează prețuri
            </Button>
            {message && <p className="text-xs text-muted">{message}</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
    );
}
