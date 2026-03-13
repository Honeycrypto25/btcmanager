import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBitcoinAthMeta, getCurrentBtcPrice } from "@/lib/btc";
import CycleAtlasClient from "./CycleAtlasClient";

export const dynamic = "force-dynamic";

type PricePoint = {
  timestamp: number;
  date: string;
  price: number;
};

type CycleSummary = {
  id: string;
  label: string;
  athDate: string;
  athPrice: number;
  lowDate: string | null;
  lowPrice: number | null;
  drawdown: number;
  daysToBottom: number | null;
  isCurrent: boolean;
  currentDrawdown: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchBitcoinHistory(): Promise<PricePoint[]> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily",
      { cache: "no-store" }
    );

    if (!res.ok) {
      throw new Error("Failed to fetch BTC history");
    }

    const data = await res.json();
    const prices = Array.isArray(data?.prices) ? data.prices : [];

    return prices.map((entry: [number, number]) => ({
      timestamp: entry[0],
      date: new Date(entry[0]).toISOString(),
      price: entry[1],
    }));
  } catch {
    return [
      { timestamp: Date.parse("2011-06-08"), date: new Date("2011-06-08").toISOString(), price: 31.9 },
      { timestamp: Date.parse("2011-11-18"), date: new Date("2011-11-18").toISOString(), price: 2 },
      { timestamp: Date.parse("2013-11-29"), date: new Date("2013-11-29").toISOString(), price: 1153 },
      { timestamp: Date.parse("2015-01-14"), date: new Date("2015-01-14").toISOString(), price: 172 },
      { timestamp: Date.parse("2017-12-16"), date: new Date("2017-12-16").toISOString(), price: 19665 },
      { timestamp: Date.parse("2018-12-15"), date: new Date("2018-12-15").toISOString(), price: 3236 },
      { timestamp: Date.parse("2021-11-10"), date: new Date("2021-11-10").toISOString(), price: 69044 },
      { timestamp: Date.parse("2022-11-21"), date: new Date("2022-11-21").toISOString(), price: 15476 },
      { timestamp: Date.parse("2025-01-20"), date: new Date("2025-01-20").toISOString(), price: 109000 },
    ];
  }
}

 function deriveCycles(points: PricePoint[], livePrice: number, athMeta?: { ath: number; athDate: string } | null) {
  if (points.length < 2) {
    return {
      cycles: [] as CycleSummary[],
      currentAth: athMeta?.ath ?? livePrice,
      currentAthDate: athMeta?.athDate ?? new Date().toISOString(),
      chartData: [] as Array<{ day: number; [key: string]: number | string | null }>,
      completedDrawdowns: [] as number[],
    };
  }

  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const globalAthPoint = sorted.reduce((maxPoint, point) =>
    point.price > maxPoint.price ? point : maxPoint
  , sorted[0]);
  const boundaries = [0];
  let rollingAthPrice = sorted[0].price;
  let rollingAthTimestamp = sorted[0].timestamp;
  let minDrawdownSinceAth = 0;

  for (let i = 1; i < sorted.length; i += 1) {
    const point = sorted[i];
    const drawdown = point.price / rollingAthPrice - 1;
    minDrawdownSinceAth = Math.min(minDrawdownSinceAth, drawdown);

    if (point.price > rollingAthPrice * 1.03) {
      const daysFromAth = (point.timestamp - rollingAthTimestamp) / DAY_MS;
      if (minDrawdownSinceAth <= -0.45 && daysFromAth >= 120) {
        boundaries.push(i);
        minDrawdownSinceAth = 0;
      }

      rollingAthPrice = point.price;
      rollingAthTimestamp = point.timestamp;
    }
  }

  const segments = boundaries.map((startIndex, index) => ({
    startIndex,
    endIndex: index < boundaries.length - 1 ? boundaries[index + 1] - 1 : sorted.length - 1,
  }));

  const cycles = segments
    .map((segment, index) => {
      const segmentPoints = sorted.slice(segment.startIndex, segment.endIndex + 1);
      if (segmentPoints.length < 2) return null;

      let athIndex = 0;
      for (let i = 1; i < segmentPoints.length; i += 1) {
        if (segmentPoints[i].price > segmentPoints[athIndex].price) {
          athIndex = i;
        }
      }

      const athPoint = segmentPoints[athIndex];
      const postAthPoints = segmentPoints.slice(athIndex);
      let lowIndex = 0;
      for (let i = 1; i < postAthPoints.length; i += 1) {
        if (postAthPoints[i].price < postAthPoints[lowIndex].price) {
          lowIndex = i;
        }
      }

      const lowPoint = postAthPoints[lowIndex];
      const isCurrent = index === segments.length - 1;
      const lowDate = isCurrent ? null : lowPoint.date;
      const lowPrice = isCurrent ? null : lowPoint.price;
      const drawdown = lowPoint.price / athPoint.price - 1;
      const currentDrawdown = livePrice / athPoint.price - 1;
      const athYear = new Date(athPoint.date).getUTCFullYear();
      const lowYear = new Date(lowPoint.date).getUTCFullYear();
      const label =
        athYear === lowYear ? `Cycle ${athYear}` : `Cycle ${athYear}-${lowYear}`;

      return {
        id: `cycle_${athYear}_${index}`,
        label,
        athDate: athPoint.date,
        athPrice: athPoint.price,
        lowDate,
        lowPrice,
        drawdown,
        daysToBottom: isCurrent
          ? null
          : Math.round((new Date(lowPoint.date).getTime() - new Date(athPoint.date).getTime()) / DAY_MS),
        isCurrent,
        currentDrawdown,
        athIndexGlobal: segment.startIndex + athIndex,
        endIndexGlobal: segment.endIndex,
      };
    })
    .filter(Boolean) as Array<CycleSummary & { athIndexGlobal: number; endIndexGlobal: number }>;

  const chartSeries = cycles.map((cycle) => {
    const seriesPoints = sorted.slice(cycle.athIndexGlobal, cycle.endIndexGlobal + 1);
    const sampled = seriesPoints.filter((_, index) => index % 7 === 0 || index === seriesPoints.length - 1);

    return {
      id: cycle.id,
      points: sampled.map((point) => ({
        day: Math.round((point.timestamp - new Date(cycle.athDate).getTime()) / DAY_MS),
        drawdown: (point.price / cycle.athPrice - 1) * 100,
      })),
    };
  });

  const allDays = Array.from(
    new Set(chartSeries.flatMap((series) => series.points.map((point) => point.day)))
  ).sort((a, b) => a - b);

  const chartData = allDays.map((day) => {
    const row: { day: number; [key: string]: number | string | null } = { day };
    chartSeries.forEach((series) => {
      const match = series.points.find((point) => point.day === day);
      row[series.id] = match ? pointRound(match.drawdown) : null;
    });
    return row;
  });

  const completedDrawdowns = cycles.filter((cycle) => !cycle.isCurrent).map((cycle) => cycle.drawdown);
  const currentAth = athMeta?.ath ?? globalAthPoint.price;
  const currentAthDate = athMeta?.athDate ?? globalAthPoint.date;

  return {
    cycles: cycles.map(({ athIndexGlobal, endIndexGlobal, ...cycle }) => cycle),
    currentAth,
    currentAthDate,
    chartData,
    completedDrawdowns,
  };
}

function pointRound(value: number) {
  return Number(value.toFixed(2));
}

function buildProjectionModels(drawdowns: number[]) {
  const sorted = [...drawdowns].sort((a, b) => a - b);
  const last3 = sorted.slice(-3);
  const avgLast3 =
    last3.length > 0 ? last3.reduce((sum, value) => sum + value, 0) / last3.length : -0.8;
  const median =
    sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : -0.8;
  const mild = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.7))] : -0.72;
  const severe = sorted.length > 0 ? sorted[Math.max(0, Math.floor(sorted.length * 0.2))] : -0.85;

  return [
    {
      id: "avg-last-3",
      label: "Average of last 3",
      drawdown: avgLast3,
      description: "Balanced baseline using the three most recent completed bear markets.",
    },
    {
      id: "median-all",
      label: "Median of all cycles",
      drawdown: median,
      description: "Less sensitive to outliers and useful as a central-case estimate.",
    },
    {
      id: "mild-case",
      label: "Mild case",
      drawdown: mild,
      description: "Assumes a shallower bear market than historical average.",
    },
    {
      id: "severe-case",
      label: "Severe case",
      drawdown: severe,
      description: "Stress case based on the harsher end of historical BTC drawdowns.",
    },
  ];
}

function buildZones(currentAth: number) {
  return [
    {
      label: "Reflex retrace",
      from: -35,
      to: -50,
      priceTop: currentAth * 0.65,
      priceBottom: currentAth * 0.5,
      tone: "bg-red-500/10 text-red-200",
    },
    {
      label: "Primary accumulation",
      from: -50,
      to: -65,
      priceTop: currentAth * 0.5,
      priceBottom: currentAth * 0.35,
      tone: "bg-orange-500/10 text-orange-200",
    },
    {
      label: "Deep value zone",
      from: -65,
      to: -75,
      priceTop: currentAth * 0.35,
      priceBottom: currentAth * 0.25,
      tone: "bg-yellow-500/10 text-yellow-200",
    },
    {
      label: "Capitulation band",
      from: -75,
      to: -85,
      priceTop: currentAth * 0.25,
      priceBottom: currentAth * 0.15,
      tone: "bg-emerald-500/10 text-emerald-200",
    },
  ];
}

export default async function CycleAtlasPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const [history, currentPrice, athMeta] = await Promise.all([
    fetchBitcoinHistory(),
    getCurrentBtcPrice(),
    getBitcoinAthMeta(),
  ]);

  const generatedAt = new Date().toISOString();
  const derived = deriveCycles(history, currentPrice, athMeta);
  const projectionModels = buildProjectionModels(derived.completedDrawdowns);
  const zones = buildZones(derived.currentAth);

  return (
    <DashboardLayout>
      <CycleAtlasClient
        currentPrice={currentPrice}
        currentAth={derived.currentAth}
        currentAthDate={derived.currentAthDate}
        cycles={derived.cycles}
        chartData={derived.chartData}
        projectionModels={projectionModels}
        zones={zones}
        generatedAt={generatedAt}
      />
    </DashboardLayout>
  );
}
