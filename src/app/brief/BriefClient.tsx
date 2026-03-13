"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, cn } from "@/components/ui/core";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarRange,
  CircleDollarSign,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;

type WalletData = {
  id: string;
  name: string;
  address: string;
  btc: number;
  invested: number;
  txCount: number;
  lastActivity: string | null;
};

type BriefClientProps = {
  currentPrice: number;
  wallets: WalletData[];
  generatedAt: string;
};

function formatCurrency(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatSignedCurrency(value: number) {
  const abs = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  return value >= 0 ? `+${abs}` : `-${abs}`;
}

function getDaysBetween(from?: Date | null, to?: Date | null) {
  if (!from || !to) return null;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

function getTone(score: number) {
  if (score >= 80) {
    return {
      label: "Elite",
      text: "text-emerald-300",
      ring: "border-emerald-400/25 bg-emerald-500/10",
    };
  }

  if (score >= 60) {
    return {
      label: "Stable",
      text: "text-primary",
      ring: "border-primary/25 bg-primary/10",
    };
  }

  return {
    label: "Fragile",
    text: "text-amber-200",
    ring: "border-amber-300/20 bg-amber-500/10",
  };
}

export default function BriefClient({
  currentPrice,
  wallets,
  generatedAt,
}: BriefClientProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [priceDelta, setPriceDelta] = useState(0);
  const [maxConcentration, setMaxConcentration] = useState(55);
  const [maxCadenceDays, setMaxCadenceDays] = useState(21);
  const [minFundedWallets, setMinFundedWallets] = useState(3);

  const analysis = useMemo(() => {
    const scenarioPrice = currentPrice * (1 + priceDelta / 100);
    const now = new Date(generatedAt);

    const walletBreakdown = wallets
      .map((wallet) => {
        const currentValue = wallet.btc * scenarioPrice;
        return {
          ...wallet,
          currentValue,
          share: 0,
          lastActivityDate: wallet.lastActivity ? new Date(wallet.lastActivity) : null,
        };
      })
      .sort((a, b) => b.currentValue - a.currentValue);

    const totalBtc = walletBreakdown.reduce((sum, wallet) => sum + wallet.btc, 0);
    const totalInvested = walletBreakdown.reduce((sum, wallet) => sum + wallet.invested, 0);
    const totalValue = walletBreakdown.reduce((sum, wallet) => sum + wallet.currentValue, 0);
    const avgEntry = totalBtc > 0 ? totalInvested / totalBtc : 0;
    const totalPnl = totalValue - totalInvested;

    const walletsWithShare = walletBreakdown.map((wallet) => ({
      ...wallet,
      share: totalBtc > 0 ? (wallet.btc / totalBtc) * 100 : 0,
    }));

    const datedActivities = walletsWithShare
      .flatMap((wallet) => (wallet.lastActivityDate ? [wallet.lastActivityDate] : []))
      .sort((a, b) => a.getTime() - b.getTime());

    const firstTx = datedActivities[0] ?? null;
    const lastTx = datedActivities[datedActivities.length - 1] ?? null;
    const accumulationDays = getDaysBetween(firstTx, now);
    const daysSinceLastBuy = getDaysBetween(lastTx, now);
    const activeWallets = walletsWithShare.filter((wallet) => wallet.txCount > 0).length;
    const concentration = walletsWithShare[0]?.share ?? 0;
    const monthlyAverageBtc =
      accumulationDays && accumulationDays > 0 ? totalBtc / (accumulationDays / 30) : totalBtc;

    const concentrationBuffer = Math.max(maxConcentration - concentration, -25);
    const cadenceBuffer =
      daysSinceLastBuy === null ? -maxCadenceDays : maxCadenceDays - daysSinceLastBuy;
    const walletBuffer = activeWallets - minFundedWallets;

    const concentrationScore = Math.max(4, Math.min(30, 18 + concentrationBuffer));
    const cadenceScore = Math.max(4, Math.min(28, 14 + cadenceBuffer));
    const walletScore = Math.max(4, Math.min(28, 12 + walletBuffer * 6));
    const pnlScore =
      totalInvested <= 0 ? 8 : Math.max(4, Math.min(14, 10 + Math.round((totalPnl / totalInvested) * 20)));
    const dataScore = Math.max(4, Math.min(10, walletsWithShare.reduce((sum, wallet) => sum + wallet.txCount, 0)));
    const briefScore = Math.max(
      0,
      Math.min(100, concentrationScore + cadenceScore + walletScore + pnlScore + dataScore)
    );
    const tone = getTone(briefScore);

    const actionItems = [
      concentration > maxConcentration
        ? `Top wallet concentration is ${concentration.toFixed(1)}%, above your ${maxConcentration}% threshold. Route new buys toward secondary wallets.`
        : `Capital distribution is within your ${maxConcentration}% concentration threshold and remains operationally balanced.`,
      daysSinceLastBuy !== null && daysSinceLastBuy > maxCadenceDays
        ? `Accumulation cadence is outside your ${maxCadenceDays}-day discipline window. Last buy was ${daysSinceLastBuy} days ago.`
        : `Accumulation cadence still fits your ${maxCadenceDays}-day operating window.`,
      activeWallets < minFundedWallets
        ? `Only ${activeWallets} funded wallet${activeWallets === 1 ? "" : "s"} versus your target of ${minFundedWallets}. Wallet separation could be stronger.`
        : `Wallet coverage meets your target with ${activeWallets} funded wallets active.`,
      avgEntry > scenarioPrice
        ? `Average entry remains above spot by ${formatCurrency(avgEntry - scenarioPrice)} in this scenario.`
        : `Spot stays above average entry by ${formatCurrency(scenarioPrice - avgEntry)} in this scenario.`
    ];

    const signals = [
      {
        label: "Treasury posture",
        value:
          totalPnl >= 0
            ? "Portfolio is sitting in unrealized profit."
            : "Portfolio is in controlled drawdown territory.",
        positive: totalPnl >= 0,
      },
      {
        label: "Wallet resilience",
        value:
          activeWallets >= minFundedWallets
            ? `${activeWallets} funded wallets satisfy your target coverage.`
            : `${activeWallets} funded wallets are below your target of ${minFundedWallets}.`,
        positive: activeWallets >= minFundedWallets,
      },
      {
        label: "Accumulation cadence",
        value:
          daysSinceLastBuy === null
            ? "No transaction history yet."
            : `${daysSinceLastBuy} days since the last recorded buy.`,
        positive: daysSinceLastBuy !== null && daysSinceLastBuy <= maxCadenceDays,
      },
      {
        label: "Concentration",
        value: `Largest wallet controls ${concentration.toFixed(1)}% of BTC exposure.`,
        positive: concentration <= maxConcentration,
      },
    ];

    return {
      scenarioPrice,
      totalBtc,
      totalInvested,
      totalValue,
      avgEntry,
      totalPnl,
      accumulationDays,
      daysSinceLastBuy,
      activeWallets,
      concentration,
      monthlyAverageBtc,
      briefScore,
      tone,
      actionItems,
      signals,
      walletBreakdown: walletsWithShare,
    };
  }, [currentPrice, generatedAt, maxCadenceDays, maxConcentration, minFundedWallets, priceDelta, wallets]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 900);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
      <Card className="space-y-6 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Wealth Brief
            </div>
            <div>
              <h1 className="font-display text-4xl leading-none text-white sm:text-5xl">
                Executive portfolio
                <span className="gradient-text"> intelligence</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-400 sm:text-base">
                Live portfolio logic plus configurable guardrails, so you can test how the brief changes under your own operating policy.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              className="mt-1 rounded-2xl"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>

            <div className={cn("rounded-[1.6rem] border px-5 py-4 text-right", analysis.tone.ring)}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-stone-500">
                Brief score
              </p>
              <p className="mt-2 font-display text-5xl leading-none text-white">{analysis.briefScore}</p>
              <p className={cn("mt-2 text-sm font-semibold", analysis.tone.text)}>
                {analysis.tone.label} operating state
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Portfolio value",
              value: formatCurrency(analysis.totalValue),
              meta: `${analysis.totalBtc.toFixed(4)} BTC live exposure`,
              icon: CircleDollarSign,
            },
            {
              label: "Average entry",
              value: formatCurrency(analysis.avgEntry),
              meta: `Scenario spot ${formatCurrency(analysis.scenarioPrice)}`,
              icon: Activity,
            },
            {
              label: "Unrealized PnL",
              value: formatSignedCurrency(analysis.totalPnl),
              meta: analysis.totalPnl >= 0 ? "Embedded upside retained" : "Below cost basis for now",
              icon: analysis.totalPnl >= 0 ? ShieldCheck : AlertTriangle,
            },
            {
              label: "Cadence",
              value: analysis.daysSinceLastBuy === null ? "No buys" : `${analysis.daysSinceLastBuy}d`,
              meta:
                analysis.accumulationDays === null
                  ? "Waiting for first transaction"
                  : `${analysis.accumulationDays} days tracked`,
              icon: CalendarRange,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
              <p className="mt-1 text-sm text-stone-400">{item.meta}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-primary">
              <BriefcaseBusiness className="h-4 w-4" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em]">
                Portfolio notes
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {analysis.actionItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-white/6 bg-black/10 px-4 py-3"
                >
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-stone-300">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-stone-500">
              System signals
            </p>
            <div className="mt-4 space-y-3">
              {analysis.signals.map((signal) => (
                <div
                  key={signal.label}
                  className="rounded-2xl border border-white/6 bg-black/10 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{signal.label}</p>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
                        signal.positive
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-amber-500/10 text-amber-200"
                      )}
                    >
                      {signal.positive ? "Healthy" : "Watch"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-400">{signal.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                Strategy lab
              </p>
              <h2 className="mt-2 font-display text-3xl text-white">Your thresholds</h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">BTC price scenario</p>
                  <p className="mt-1 text-sm text-stone-400">
                    Test the brief at {formatCurrency(analysis.scenarioPrice)} without changing stored data.
                  </p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                  {priceDelta > 0 ? "+" : ""}
                  {priceDelta}%
                </div>
              </div>
              <input
                type="range"
                min={-30}
                max={30}
                step={1}
                value={priceDelta}
                onChange={(e) => setPriceDelta(Number(e.target.value))}
                className="mt-4 w-full accent-[var(--color-primary)]"
              />
            </div>

            {[
              {
                label: "Max wallet concentration",
                value: maxConcentration,
                setter: setMaxConcentration,
                min: 25,
                max: 80,
                suffix: "%",
              },
              {
                label: "Max cadence gap",
                value: maxCadenceDays,
                setter: setMaxCadenceDays,
                min: 7,
                max: 60,
                suffix: "d",
              },
              {
                label: "Min funded wallets",
                value: minFundedWallets,
                setter: setMinFundedWallets,
                min: 1,
                max: 8,
                suffix: "",
              },
            ].map((control) => (
              <div
                key={control.label}
                className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{control.label}</p>
                    <p className="mt-1 text-sm text-stone-400">Adjust the rule and the brief recalculates instantly.</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-sm font-semibold text-white">
                    {control.value}
                    {control.suffix}
                  </div>
                </div>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={1}
                  value={control.value}
                  onChange={(e) => control.setter(Number(e.target.value))}
                  className="mt-4 w-full accent-[var(--color-primary)]"
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                Capital concentration
              </p>
              <h2 className="mt-2 font-display text-3xl text-white">Wallet breakdown</h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {analysis.walletBreakdown.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-stone-400">
                No funded wallets yet. Add an address to unlock the brief.
              </div>
            ) : (
              analysis.walletBreakdown.slice(0, 5).map((wallet, index) => (
                <div
                  key={wallet.id}
                  className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {index + 1}
                        </span>
                        <p className="truncate text-sm font-semibold text-white">{wallet.name}</p>
                      </div>
                      <p className="mt-2 truncate font-mono text-xs text-stone-500">
                        {wallet.address}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{wallet.share.toFixed(1)}%</p>
                      <p className="text-xs text-stone-500">share of BTC</p>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/6">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#8ec5a4,#d6a95f,#f3e3ba)]"
                      style={{ width: `${Math.min(wallet.share, 100)}%` }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-stone-500">BTC</p>
                      <p className="mt-1 font-semibold text-white">{wallet.btc.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-stone-500">Value</p>
                      <p className="mt-1 font-semibold text-white">{formatCurrency(wallet.currentValue)}</p>
                    </div>
                    <div>
                      <p className="text-stone-500">Tx</p>
                      <p className="mt-1 font-semibold text-white">{wallet.txCount}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
            Quick metrics
          </p>
          <div className="mt-4 space-y-4">
            {[
              { label: "Tracked wallets", value: wallets.length.toString() },
              { label: "Funded wallets", value: analysis.activeWallets.toString() },
              {
                label: "Monthly BTC pace",
                value: `${analysis.monthlyAverageBtc.toFixed(4)} BTC`,
              },
              {
                label: "Top wallet share",
                value: `${analysis.concentration.toFixed(1)}%`,
              },
              {
                label: "Policy target",
                value: `${minFundedWallets} wallets / ${maxCadenceDays}d / ${maxConcentration}%`,
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3"
              >
                <span className="text-sm text-stone-400">{metric.label}</span>
                <span className="text-right text-sm font-semibold text-white">{metric.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[1.4rem] border border-primary/20 bg-primary/8 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">What changed</p>
                <p className="mt-1 text-sm leading-6 text-stone-400">
                  This brief is now policy-aware. Change your thresholds or simulate a BTC move and every score, note and signal recalculates in real time.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
