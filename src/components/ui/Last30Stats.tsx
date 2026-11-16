"use client";

import React, { useMemo } from "react";
import { Card, cn } from "@/components/ui/core";

export interface Last30Lot {
    status: string; // "OPEN" | "FILLED" | "FAILED" | …
    boughtAt: string;
    buyAmountUsd: number;
    buyPriceUsd: number;
    buyFeeUsd: number;
    soldAt: string | null;
    sellProceedsUsd: number;
    realizedPnlUsd: number;
    sellFeeUsd: number;
    targetPrice: number | null;
    tokensOnOrder: number; // tokens the active sell order will sell (planned amount, else what is left)
}

interface Props {
    lots: Last30Lot[]; // all lots of the bot, not the filtered selection
    currentPrice: number | null;
    fmtUsd: (n: number) => string;
    fmtFee: (n: number) => string;
    fmtPrice: (n: number) => string;
}

const WINDOW_MS = 30 * 86_400_000;

function Stat({ label, value, hint, positive }: { label: string; value: string; hint?: string; positive?: boolean }) {
    return (
        <Card className="p-4">
            <p className="text-xs text-faint">{label}</p>
            <p className={cn("mt-1 font-display text-lg font-medium", positive === undefined ? "text-foreground" : positive ? "text-emerald-300" : "text-red-300")}>{value}</p>
            {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
        </Card>
    );
}

/** Second stats row of a DCA bot page: the last 30 days, plus what the active sell orders are worth. */
export function Last30Stats({ lots, currentPrice, fmtUsd, fmtFee, fmtPrice }: Props) {
    const s = useMemo(() => {
        const since = Date.now() - WINDOW_MS;
        let invested = 0;
        let tokens = 0;
        let buys = 0;
        let proceeds = 0;
        let pnl = 0;
        let sells = 0;
        let fees = 0;
        let activeAtTarget = 0;
        let activeNow = 0;
        let active = 0;
        for (const l of lots) {
            if (l.status === "FAILED") continue;
            if (new Date(l.boughtAt).getTime() >= since) {
                invested += l.buyAmountUsd;
                if (l.buyPriceUsd > 0) tokens += l.buyAmountUsd / l.buyPriceUsd;
                fees += l.buyFeeUsd;
                buys++;
            }
            if (l.status === "FILLED" && l.soldAt && new Date(l.soldAt).getTime() >= since) {
                proceeds += l.sellProceedsUsd;
                pnl += l.realizedPnlUsd;
                fees += l.sellFeeUsd;
                sells++;
            }
            if (l.status === "OPEN" && l.targetPrice && l.tokensOnOrder > 0) {
                activeAtTarget += l.tokensOnOrder * l.targetPrice;
                if (currentPrice) activeNow += l.tokensOnOrder * currentPrice;
                active++;
            }
        }
        return { invested, avgBuy: tokens > 0 ? invested / tokens : null, buys, proceeds, pnl, sells, fees, activeAtTarget, activeNow, active };
    }, [lots, currentPrice]);

    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    return (
        <div>
            <p className="mb-2 text-xs text-faint">Ultimele 30 de zile · toate ciclurile botului, indiferent de filtrele de mai sus</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Investit · 30 zile" value={fmtUsd(s.invested)} hint={plural(s.buys, "cumpărare", "cumpărări")} />
                <Stat label="Încasat · 30 zile" value={fmtUsd(s.proceeds)} hint={plural(s.sells, "vânzare finalizată", "vânzări finalizate")} />
                <Stat label="P&L realizat · 30 zile" value={fmtUsd(s.pnl)} positive={s.sells > 0 ? s.pnl >= 0 : undefined} />
                <Stat label="Fee-uri · 30 zile" value={fmtFee(s.fees)} />
                <Stat label="Preț mediu de cumpărare · 30 zile" value={s.avgBuy !== null ? fmtPrice(s.avgBuy) : "—"} hint={currentPrice ? `acum ${fmtPrice(currentPrice)}` : undefined} />
                <Stat
                    label="Valoarea ordinelor active"
                    value={s.active > 0 ? fmtUsd(s.activeAtTarget) : "—"}
                    hint={s.active > 0 ? `la țintă · ${plural(s.active, "ordin", "ordine")}${currentPrice ? ` · acum ${fmtUsd(s.activeNow)}` : ""}` : "niciun ordin activ"}
                />
            </div>
        </div>
    );
}
