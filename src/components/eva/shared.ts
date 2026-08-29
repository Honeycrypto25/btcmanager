import { Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { ElementType } from "react";

// Prisma Decimal/DateTime fields arrive from the server as strings after the JSON round-trip.
export interface LotDTO {
    id: string;
    status: string;
    buyAmountUsd: string;
    evaAcquired: string;
    buyPriceUsd: string;
    buyFeeUsd: string;
    buyTxSignature: string | null;
    boughtAt: string;
    targetPriceUsd: string | null;
    sellAmountEvaPlanned: string | null;
    jupiterOrderKey: string | null;
    sellOrderCreatedAt: string | null;
    sellOrderTxSignature: string | null;
    soldAt: string | null;
    evaSold: string | null;
    sellProceedsUsd: string | null;
    sellFeeUsd: string | null;
    sellTxSignature: string | null;
    realizedPnlUsd: string | null;
    evaRemaining: string;
    lastCheckedAt: string | null;
    notes: string | null;
}

export interface SettingsDTO {
    id: string;
    enabled: boolean;
    walletAddress: string;
    buyAmountUsd: string;
    intervalHours: number;
    takeProfitPercent: string;
    sellAmountUsd: string;
    slippageBps: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunError: string | null;
    sweepEnabled: boolean;
    sweepMinBalanceEva: string;
    lastSweepAt: string | null;
    lastSweepStatus: string | null;
    lastSweepError: string | null;
}

export interface SweepDTO {
    id: string;
    status: string;
    balanceBeforeEva: string;
    amountEva: string;
    destination: string;
    txSignature: string | null;
    errorMessage: string | null;
    manual: boolean;
    createdAt: string;
}

export function formatUsd(n: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/**
 * Same as formatUsd, but shows up to 4 decimals for sub-cent amounts
 * instead of collapsing them to "$0.00" — a real Solana network fee
 * (typically $0.0005-$0.002) otherwise displays as "$0.00" and looks like
 * an unpopulated field, which it isn't. Same fix as the SOL module's
 * formatUsdFee.
 */
export function formatUsdFee(n: number): string {
    if (n > 0 && n < 0.01) {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
    }
    return formatUsd(n);
}

export const statusMeta: Record<string, { label: string; icon: ElementType; className: string }> = {
    PENDING_SELL_ORDER: { label: "Ordin în curs", icon: Clock, className: "text-amber-300 bg-amber-500/10 border-amber-400/30" },
    OPEN: { label: "Ordin activ", icon: Clock, className: "text-primary bg-primary/10 border-primary/30" },
    FILLED: { label: "Vândut", icon: CheckCircle2, className: "text-emerald-300 bg-emerald-500/10 border-emerald-400/30" },
    CANCELLED: { label: "Anulat", icon: XCircle, className: "text-muted bg-white/[0.04] border-white/10" },
    FAILED: { label: "Eșuat", icon: AlertTriangle, className: "text-red-300 bg-red-500/10 border-red-400/30" },
};

/** Lots still "in motion" — bought, and either not yet holding a sell order or waiting on one to fill. */
export const PENDING_STATUSES = new Set(["PENDING_SELL_ORDER", "OPEN"]);

/** Lots that won't change state on their own anymore. */
export const FINAL_STATUSES = new Set(["FILLED", "CANCELLED", "FAILED"]);
