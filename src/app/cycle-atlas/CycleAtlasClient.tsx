"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  CalendarRange,
  ChevronRight,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingDown,
  ShieldAlert,
  SearchCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Card, cn } from "@/components/ui/core";

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

type ChartPoint = {
  day: number;
  [key: string]: number | string | null;
};

type ProjectionModel = {
  id: string;
  label: string;
  drawdown: number;
  description: string;
};

type Zone = {
  label: string;
  from: number;
  to: number;
  priceTop: number;
  priceBottom: number;
  tone: string;
};

type Props = {
  currentPrice: number;
  currentAth: number;
  currentAthDate: string;
  cycles: CycleSummary[];
  chartData: ChartPoint[];
  projectionModels: ProjectionModel[];
  zones: Zone[];
  generatedAt: string;
};

type AnalystReport = {
  marketRegime: "Bear Market" | "Transition" | "Probable New Cycle" | "Confirmed New Cycle";
  confidence: number;
  executiveSummary: string;
  historicalMatch: string;
  evidence: string[];
  invalidationSignals: string[];
  watchNext: string[];
  sourceNotes: string[];
};

type ReportHistoryItem = {
  id: string;
  language: Language;
  marketRegime: AnalystReport["marketRegime"];
  confidence: number;
  generatedAt: string;
  snapshotPrice: number;
  snapshotAth: number;
  evaluations?: Array<{
    id: string;
    horizonDays: number;
    verdict: string;
    notes: string | null;
    evaluatedAt: string;
  }>;
};

type PaginationState = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
};

type Language = "en" | "ro";

const copy = {
  en: {
    cycleAtlas: "Cycle Atlas",
    liveCycleEngine: "cycle engine",
    liveBtc: "Live BTC",
    intro:
      "Cycles are derived automatically from BTC history. When a new macro ATH arrives, the current cycle updates without hardcoded rows.",
    currentPrice: "Current price",
    snapshotGenerated: "Snapshot generated",
    currentAth: "Current ATH",
    currentDrawdown: "Current drawdown",
    relativeCurrentAth: "Relative to the current macro ATH",
    avgDaysToBottom: "Avg. days to bottom",
    basedOnCompleted: "Based on",
    completedCycles: "completed cycles",
    bearZones: "Bear market zones",
    drawdownComparator: "Drawdown comparator",
    athToBottomMap: "ATH-to-bottom map",
    chartIntro:
      "Each line measures percentage drawdown from cycle ATH as days pass. The current cycle updates from live market data.",
    allCycles: "All cycles",
    current: "Current",
    daysSinceAth: "Days Since ATH",
    projectionModel: "Projection model",
    impliedBottom: "Implied bottom",
    model: "Model",
    drawdownTarget: "Drawdown target",
    avgCompletedDrawdown: "Avg completed drawdown",
    cycleLedger: "Cycle ledger",
    autoCycleTable: "Auto-generated cycle table",
    cycleLedgerIntro:
      "New cycles appear automatically when BTC makes a new macro ATH after a major bear phase.",
    cycle: "Cycle",
    athDate: "ATH Date",
    athPrice: "ATH Price",
    lowDate: "Low Date",
    lowPrice: "Low Price",
    days: "Days",
    drawdown: "Drawdown",
    currentCycle: "Current Cycle",
    inProgress: "In progress",
    live: "Live",
    projectedBottomRow: "Projected Bottom",
    future: "Future",
    average: "average",
    aiCycleAnalyst: "AI Cycle Analyst",
    regimeLayer: "Regime interpretation layer",
    aiIntro:
      "This layer interprets the live cycle engine, compares it to prior BTC cycles, and can use fresh web context to explain whether we are still in bear structure, in transition, or entering a new cycle.",
    refreshAiRead: "Refresh AI Read",
    generatingAi: "Generating AI cycle read with market context...",
    marketRegime: "Market regime",
    confidence: "Confidence",
    closestHistoricalMatch: "Closest historical match",
    invalidationMap: "Invalidation map",
    whyModel: "Why the model thinks that",
    watchNext: "Watch next",
    sourceNotes: "Source notes",
    refresh: "Refresh",
    reportHistory: "Report history",
    lastSavedReport: "Last saved report",
    loadSavedReport: "Loading last saved report...",
    generateHint:
      "AI analysis does not run automatically. Press “Refresh AI Read” when you want a new verdict, so we do not consume API usage unnecessarily.",
    generateBlocked:
      "Not generating a new report yet. BTC price has not dropped enough below the last report snapshot.",
    minDropNeeded: "Min drop needed",
    currentDropVsLast: "Current drop vs last report",
    noHistoryYet: "No saved reports yet for the selected model.",
    generateUnlock: "A new report unlocks after a deeper BTC pullback.",
    loadReport: "Load this report",
    generatedIn: "Generated in",
    evaluations: "Evaluations",
    horizon: "Horizon",
    verdict: "Verdict",
    latestSnapshots: "Latest saved AI snapshots for the selected model, regardless of language.",
    ready: "Ready",
    stillLocked: "Still locked",
    previous: "Previous",
    next: "Next",
    page: "Page",
    elapsed: "elapsed",
  },
  ro: {
    cycleAtlas: "Atlasul Ciclurilor",
    liveCycleEngine: "motor de cicluri",
    liveBtc: "BTC live",
    intro:
      "Ciclurile sunt derivate automat din istoricul BTC. Când apare un nou ATH macro, ciclul curent se actualizează fără rânduri hardcodate.",
    currentPrice: "Preț curent",
    snapshotGenerated: "Snapshot generat",
    currentAth: "ATH curent",
    currentDrawdown: "Drawdown curent",
    relativeCurrentAth: "Raportat la ATH-ul macro curent",
    avgDaysToBottom: "Medie zile până la bottom",
    basedOnCompleted: "Bazat pe",
    completedCycles: "cicluri încheiate",
    bearZones: "Zone de bear market",
    drawdownComparator: "Comparator drawdown",
    athToBottomMap: "Harta ATH-bottom",
    chartIntro:
      "Fiecare linie măsoară drawdown-ul procentual față de ATH-ul ciclului pe măsură ce trec zilele. Ciclul curent se actualizează din date live.",
    allCycles: "Toate ciclurile",
    current: "Curent",
    daysSinceAth: "Zile de la ATH",
    projectionModel: "Model de proiecție",
    impliedBottom: "Bottom estimat",
    model: "Model",
    drawdownTarget: "Țintă de drawdown",
    avgCompletedDrawdown: "Drawdown mediu cicluri încheiate",
    cycleLedger: "Registrul ciclurilor",
    autoCycleTable: "Tabel de cicluri generat automat",
    cycleLedgerIntro:
      "Ciclurile noi apar automat când BTC face un nou ATH macro după o fază majoră de bear market.",
    cycle: "Ciclu",
    athDate: "Data ATH",
    athPrice: "Preț ATH",
    lowDate: "Data bottom",
    lowPrice: "Preț bottom",
    days: "Zile",
    drawdown: "Drawdown",
    currentCycle: "Ciclul curent",
    inProgress: "În desfășurare",
    live: "Live",
    projectedBottomRow: "Bottom proiectat",
    future: "Viitor",
    average: "medie",
    aiCycleAnalyst: "Analist AI de Cicluri",
    regimeLayer: "Strat de interpretare a regimului",
    aiIntro:
      "Acest strat interpretează motorul live al ciclurilor, îl compară cu ciclurile BTC anterioare și poate folosi context web proaspăt pentru a explica dacă suntem încă în structură de bear, în tranziție sau la începutul unui nou ciclu.",
    refreshAiRead: "Reîmprospătează analiza AI",
    generatingAi: "Generez analiza AI cu context de piață...",
    marketRegime: "Regim de piață",
    confidence: "Încredere",
    closestHistoricalMatch: "Cea mai apropiată comparație istorică",
    invalidationMap: "Hartă de invalidare",
    whyModel: "De ce gândește modelul asta",
    watchNext: "Ce urmărim în continuare",
    sourceNotes: "Note de sursă",
    refresh: "Refresh",
    reportHistory: "Istoric rapoarte",
    lastSavedReport: "Ultimul raport salvat",
    loadSavedReport: "Încarc ultimul raport salvat...",
    generateHint:
      "Analiza AI nu rulează automat. Apasă pe „Reîmprospătează analiza AI” când vrei un verdict nou, ca să nu consumăm API-ul inutil.",
    generateBlocked:
      "Nu generez un raport nou încă. Prețul BTC nu a scăzut suficient sub snapshot-ul ultimului raport.",
    minDropNeeded: "Scădere minimă necesară",
    currentDropVsLast: "Scăderea curentă vs ultimul raport",
    noHistoryYet: "Nu există încă rapoarte salvate pentru modelul selectat.",
    generateUnlock: "Un raport nou se deblochează după un pullback BTC mai adânc.",
    loadReport: "Încarcă raportul",
    generatedIn: "Generat în",
    evaluations: "Evaluări",
    horizon: "Orizont",
    verdict: "Verdict",
    latestSnapshots: "Ultimele snapshot-uri AI salvate pentru modelul selectat, indiferent de limbă.",
    ready: "Pregătit",
    stillLocked: "Încă blocat",
    previous: "Anterior",
    next: "Următor",
    page: "Pagina",
    elapsed: "trecute",
  },
} as const;

const CHART_COLORS = ["#f3c77a", "#8ec5a4", "#d17cff", "#60a5fa", "#f97316", "#ef4444"];
const MIN_DROP_TO_REFRESH = 3;

function formatCurrency(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatDate(value: string | null, language: Language) {
  if (!value) return language === "ro" ? "În desfășurare" : "In progress";
  return new Intl.DateTimeFormat(language === "ro" ? "ro-RO" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Server returned an invalid JSON response.");
  }
}

export default function CycleAtlasClient({
  currentPrice,
  currentAth,
  currentAthDate,
  cycles,
  chartData,
  projectionModels,
  zones,
  generatedAt,
}: Props) {
  const router = useRouter();
  const [selectedCycle, setSelectedCycle] = useState<string>("all");
  const [selectedModelId, setSelectedModelId] = useState<string>(
    projectionModels[0]?.id ?? "avg-last-3"
  );
  const [language, setLanguage] = useState<Language>("ro");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [report, setReport] = useState<AnalystReport | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [savedReportLoading, setSavedReportLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [lastGeneratedPrice, setLastGeneratedPrice] = useState<number | null>(null);
  const [lastGeneratedAth, setLastGeneratedAth] = useState<number | null>(null);
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 6,
    totalCount: 0,
    totalPages: 1,
  });
  const requestIdRef = useRef(0);

  const selectedModel =
    projectionModels.find((model) => model.id === selectedModelId) ?? projectionModels[0];
  const t = copy[language];

  const localizedProjectionModels = useMemo(
    () =>
      projectionModels.map((model) => ({
        ...model,
        label:
          language === "ro"
            ? ({
                "avg-last-3": "Media ultimelor 3",
                "median-all": "Mediana tuturor ciclurilor",
                "mild-case": "Scenariu blând",
                "severe-case": "Scenariu sever",
              }[model.id] ?? model.label)
            : model.label,
        description:
          language === "ro"
            ? ({
                "avg-last-3":
                  "Linie de bază echilibrată folosind ultimele trei bear market-uri încheiate.",
                "median-all":
                  "Mai puțin sensibil la extreme și util ca estimare de caz central.",
                "mild-case":
                  "Presupune un bear market mai puțin sever decât media istorică.",
                "severe-case":
                  "Scenariu de stres bazat pe zona dură a drawdown-urilor istorice BTC.",
              }[model.id] ?? model.description)
            : model.description,
      })),
    [language, projectionModels]
  );

  const localizedZones = useMemo(
    () =>
      zones.map((zone, index) => ({
        ...zone,
        label:
          language === "ro"
            ? ["Retragere reflex", "Acumulare principală", "Zonă deep value", "Bandă de capitulare"][index] ??
              zone.label
            : zone.label,
      })),
    [language, zones]
  );

  const regimeLabel = (value: AnalystReport["marketRegime"]) => {
    if (language === "en") return value;
    return (
      {
        "Bear Market": "Bear Market",
        Transition: "Tranziție",
        "Probable New Cycle": "Probabil început de ciclu nou",
        "Confirmed New Cycle": "Ciclu nou confirmat",
      }[value] ?? value
    );
  };

  const verdictLabel = (value: string) => {
    if (language === "en") return value;
    return (
      {
        validated: "validat",
        invalidated: "invalidat",
        mixed: "mixt",
      }[value] ?? value
    );
  };

  const currentCycle = cycles.find((cycle) => cycle.isCurrent);
  const projectedBottom = currentAth * (1 + (selectedModel?.drawdown ?? -0.8));
  const projectedDropPercent = (selectedModel?.drawdown ?? -0.8) * 100;
  const filteredChartData = useMemo(() => {
    if (selectedCycle === "all") return chartData;
    return chartData.map((point) => {
      const next: ChartPoint = { day: point.day };
      const value = point[selectedCycle];
      next[selectedCycle] = typeof value === "number" ? value : null;
      return next;
    });
  }, [chartData, selectedCycle]);

  const cycleMetrics = useMemo(() => {
    const completed = cycles.filter((cycle) => !cycle.isCurrent);
    const avgDrawdown =
      completed.length > 0
        ? completed.reduce((sum, cycle) => sum + cycle.drawdown, 0) / completed.length
        : 0;
    const avgDays =
      completed.filter((cycle) => cycle.daysToBottom !== null).length > 0
        ? completed.reduce((sum, cycle) => sum + (cycle.daysToBottom ?? 0), 0) /
          completed.filter((cycle) => cycle.daysToBottom !== null).length
        : 0;

    return {
      avgDrawdown,
      avgDays,
      completedCount: completed.length,
    };
  }, [cycles]);

  const currentDropFromLastReport =
    lastGeneratedPrice && lastGeneratedPrice > 0
      ? ((currentPrice - lastGeneratedPrice) / lastGeneratedPrice) * 100
      : null;
  const canGenerateNewReport =
    !lastGeneratedPrice || (currentDropFromLastReport !== null && currentDropFromLastReport <= -MIN_DROP_TO_REFRESH);
  const daysSinceAth = useMemo(() => {
    const athTime = new Date(currentAthDate).getTime();
    const nowTime = new Date(generatedAt).getTime();
    return Math.max(0, Math.round((nowTime - athTime) / (24 * 60 * 60 * 1000)));
  }, [currentAthDate, generatedAt]);

  const analysisPayload = useMemo(
    () => ({
      generatedAt,
      currentPrice,
      currentAth,
      currentAthDate,
      currentDrawdown: currentCycle?.currentDrawdown ?? 0,
      selectedModel: selectedModel
        ? {
            label:
              localizedProjectionModels.find((model) => model.id === selectedModel.id)?.label ??
              selectedModel.label,
            drawdown: selectedModel.drawdown,
            impliedBottom: projectedBottom,
          }
        : null,
      language,
      cycleMetrics,
      cycles: cycles.map((cycle) => ({
        label: cycle.label,
        athDate: cycle.athDate,
        athPrice: cycle.athPrice,
        lowDate: cycle.lowDate,
        lowPrice: cycle.lowPrice,
        drawdown: cycle.drawdown,
        currentDrawdown: cycle.currentDrawdown,
        daysToBottom: cycle.daysToBottom,
        isCurrent: cycle.isCurrent,
      })),
      zones,
    }),
    [
      currentAth,
      currentAthDate,
      currentCycle?.currentDrawdown,
      currentPrice,
      cycleMetrics,
      cycles,
      generatedAt,
      language,
      localizedProjectionModels,
      projectedBottom,
      selectedModel,
      zones,
    ]
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 900);
  };

  useEffect(() => {
    setHistoryPage(1);
    setSelectedReportId(null);
  }, [selectedModelId]);

  const runAnalysis = async (options?: { silent?: boolean }) => {
    if (!canGenerateNewReport && report) {
      setAnalysisError(
        language === "ro"
          ? t.generateBlocked
          : t.generateBlocked
      );
      return;
    }

    const requestId = ++requestIdRef.current;

    try {
      if (!options?.silent || !report) {
        setAnalysisLoading(true);
      }
      setAnalysisError(null);
      const res = await fetch("/api/cycle-atlas/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysisPayload),
      });

      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error || "AI analysis failed.");
      }
      if (!data) {
        throw new Error("AI analysis returned an empty response.");
      }

      if (requestId === requestIdRef.current) {
        setReport((data as { report: AnalystReport }).report);
        const savedAt = new Date().toISOString();
        setLastGeneratedAt(savedAt);
        setLastGeneratedPrice(currentPrice);
        setLastGeneratedAth(currentAth);
        setSelectedReportId(null);

        const saveRes = await fetch("/api/cycle-atlas/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language,
              modelId: selectedModelId,
              report: data.report,
              generatedAt: savedAt,
              snapshotPrice: currentPrice,
              snapshotAth: currentAth,
            }),
          });

        const savedData = await readJsonSafe(saveRes);
        if (!saveRes.ok) {
          throw new Error((savedData as { error?: string } | null)?.error || "Failed to save generated report.");
        }
        if (!savedData) {
          throw new Error("Report save returned an empty response.");
        }

        setSelectedReportId((savedData as { report: any }).report.id);
        setReportHistory((prev) => {
          const nextItem = {
            id: (savedData as { report: any }).report.id,
            language: (savedData as { report: any }).report.language,
            marketRegime: (savedData as { report: any }).report.marketRegime,
            confidence: (savedData as { report: any }).report.confidence,
            generatedAt: (savedData as { report: any }).report.generatedAt,
            snapshotPrice: (savedData as { report: any }).report.snapshotPrice,
            snapshotAth: (savedData as { report: any }).report.snapshotAth,
            evaluations: (savedData as { report: any }).report.evaluations ?? [],
          };

          const deduped = prev.filter((item) => item.id !== nextItem.id);
          return [nextItem, ...deduped].slice(0, pagination.limit);
        });
        setPagination((prev) => ({
          ...prev,
          page: 1,
          totalCount: prev.totalCount + 1,
          totalPages: Math.max(1, Math.ceil((prev.totalCount + 1) / prev.limit)),
        }));
        setHistoryPage(1);
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setAnalysisError(error instanceof Error ? error.message : "AI analysis failed.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setAnalysisLoading(false);
      }
    }
  };

  useEffect(() => {
    const loadSavedReport = async () => {
      try {
        setSavedReportLoading(true);
        setAnalysisError(null);

        const res = await fetch(
          `/api/cycle-atlas/report?modelId=${selectedModelId}&page=${historyPage}&limit=6${
            selectedReportId ? `&selectedId=${selectedReportId}` : ""
          }`
        );
        const data = await readJsonSafe(res);

        if (!res.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Failed to load saved report.");
        }
        if (!data) {
          throw new Error("Saved report endpoint returned an empty response.");
        }

        setReportHistory(
          (((data as { reports?: any[] }).reports) ?? []).map((item: any) => ({
            id: item.id,
            language: item.language,
            marketRegime: item.marketRegime,
            confidence: item.confidence,
            generatedAt: item.generatedAt,
            snapshotPrice: item.snapshotPrice,
            snapshotAth: item.snapshotAth,
            evaluations: item.evaluations,
          }))
        );
        setPagination(
          (data as { pagination?: PaginationState }).pagination ?? {
            page: historyPage,
            limit: 6,
            totalCount: 0,
            totalPages: 1,
          }
        );

        if (!(data as { report?: any }).report) {
          setReport(null);
          setLastGeneratedAt(null);
          setLastGeneratedPrice(null);
          setLastGeneratedAth(null);
          return;
        }

        const dbReport = (data as { report: any }).report;
        setSelectedReportId(dbReport.id);
        setReport({
          marketRegime: dbReport.marketRegime,
          confidence: dbReport.confidence,
          executiveSummary: dbReport.executiveSummary,
          historicalMatch: dbReport.historicalMatch,
          evidence: dbReport.evidence,
          invalidationSignals: dbReport.invalidationSignals,
          watchNext: dbReport.watchNext,
          sourceNotes: dbReport.sourceNotes,
        });
        setLastGeneratedAt(dbReport.generatedAt);
        setLastGeneratedPrice(dbReport.snapshotPrice);
        setLastGeneratedAth(dbReport.snapshotAth);
      } catch (error) {
        setAnalysisError(error instanceof Error ? error.message : "Failed to load saved report.");
        setReportHistory([]);
      } finally {
        setSavedReportLoading(false);
      }
    };

    void loadSavedReport();
  }, [historyPage, language, selectedModelId, selectedReportId]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.45fr]">
        <Card className="space-y-6 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {t.cycleAtlas}
              </div>
              <div>
                <h1 className="font-display text-4xl leading-none text-white sm:text-5xl">
                  {t.liveBtc}
                  <span className="gradient-text"> {t.liveCycleEngine}</span>
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-stone-400">
                  {t.intro}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-1">
                {(["ro", "en"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLanguage(option)}
                    className={cn(
                      "rounded-[0.9rem] px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition",
                      language === option
                        ? "bg-primary text-black"
                        : "text-stone-400 hover:text-white"
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="rounded-2xl"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                {t.currentPrice}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(currentPrice)}</p>
              <p className="mt-1 text-sm text-stone-400">
                {t.snapshotGenerated} {formatDate(generatedAt, language)}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Target className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                {t.currentAth}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(currentAth)}</p>
              <p className="mt-1 text-sm text-stone-400">{formatDate(currentAthDate, language)}</p>
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <TrendingDown className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                {t.currentDrawdown}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatPercent(currentCycle?.currentDrawdown ?? 0, 2)}
              </p>
              <p className="mt-1 text-sm text-stone-400">
                {t.relativeCurrentAth}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <CalendarRange className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                {t.avgDaysToBottom}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {Math.round(cycleMetrics.avgDays || 0)}d
              </p>
              <p className="mt-1 text-sm text-stone-400">
                {t.basedOnCompleted} {cycleMetrics.completedCount} {t.completedCycles}
              </p>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-primary">
              <BarChart3 className="h-4 w-4" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em]">
                {t.bearZones}
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {localizedZones.map((zone) => (
                <div
                  key={zone.label}
                  className="rounded-[1.35rem] border border-white/8 bg-black/10 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{zone.label}</p>
                    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.25em]", zone.tone)}>
                      {formatPercent(zone.from, 0)} to {formatPercent(zone.to, 0)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm text-stone-400">
                    <span>{formatCurrency(zone.priceTop)}</span>
                    <ChevronRight className="h-4 w-4 text-stone-600" />
                    <span className="font-semibold text-white">{formatCurrency(zone.priceBottom)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-6 p-6 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                {t.drawdownComparator}
              </p>
              <h2 className="mt-2 font-display text-4xl text-white">{t.athToBottomMap}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
                {t.chartIntro}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCycle("all")}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition",
                  selectedCycle === "all"
                    ? "bg-primary text-black"
                    : "bg-white/6 text-stone-300 hover:bg-white/10 hover:text-white"
                )}
              >
                {t.allCycles}
              </button>
              {cycles.map((cycle) => (
                <button
                  key={cycle.id}
                  type="button"
                  onClick={() => setSelectedCycle(cycle.id)}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition",
                    selectedCycle === cycle.id
                      ? "bg-primary text-black"
                      : "bg-white/6 text-stone-300 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {cycle.isCurrent
                    ? t.current
                    : language === "ro"
                      ? cycle.label.replace("Cycle ", "Ciclu ")
                      : cycle.label.replace("Cycle ", "")}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[340px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredChartData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#8c8c8c", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: t.daysSinceAth, position: "insideBottom", offset: -4, fill: "#777" }}
                />
                <YAxis
                  tick={{ fill: "#8c8c8c", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[-95, 5]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatPercent(typeof value === "number" ? value : Number(value ?? 0), 1),
                    name,
                  ]}
                  labelFormatter={(value) => `Day ${value}`}
                  contentStyle={{
                    background: "rgba(10,10,10,0.95)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "16px",
                  }}
                />
                <ReferenceLine y={projectedDropPercent} stroke="#22c55e" strokeDasharray="4 4" />
                {selectedCycle === "all" && (
                  <Area
                    type="monotone"
                    dataKey={cycles.find((cycle) => cycle.isCurrent)?.id ?? ""}
                    stroke="none"
                    fill="rgba(214,169,95,0.08)"
                  />
                )}
                {cycles.map((cycle, index) => (
                  <Line
                    key={cycle.id}
                    type="monotone"
                    dataKey={cycle.id}
                    stroke={cycle.isCurrent ? "#f3c77a" : CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={cycle.isCurrent ? 3 : 2}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                {t.projectionModel}
              </p>
              <div className="mt-4 grid gap-3">
                {localizedProjectionModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setSelectedModelId(model.id)}
                    className={cn(
                      "rounded-[1.35rem] border px-4 py-4 text-left transition",
                      selectedModelId === model.id
                        ? "border-primary/25 bg-primary/10"
                        : "border-white/8 bg-black/10 hover:bg-white/[0.04]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{model.label}</p>
                      <span className="text-sm font-semibold text-primary">
                        {formatPercent(model.drawdown * 100, 0)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-400">{model.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                {t.impliedBottom}
              </p>
              <p className="mt-3 font-display text-5xl leading-none text-white">
                {formatCurrency(projectedBottom)}
              </p>
              <p className="mt-2 text-sm text-stone-400">
                {t.model}: {localizedProjectionModels.find((model) => model.id === selectedModel?.id)?.label ?? selectedModel?.label}. {t.drawdownTarget} {formatPercent(projectedDropPercent, 0)}.
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/10 px-4 py-3">
                  <span className="text-sm text-stone-400">{t.currentAth}</span>
                  <span className="text-sm font-semibold text-white">{formatCurrency(currentAth)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/10 px-4 py-3">
                  <span className="text-sm text-stone-400">{t.currentPrice}</span>
                  <span className="text-sm font-semibold text-white">{formatCurrency(currentPrice)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/10 px-4 py-3">
                  <span className="text-sm text-stone-400">{t.avgCompletedDrawdown}</span>
                  <span className="text-sm font-semibold text-white">
                    {formatPercent(cycleMetrics.avgDrawdown * 100, 1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
              {t.cycleLedger}
            </p>
            <h2 className="mt-2 font-display text-4xl text-white">{t.autoCycleTable}</h2>
          </div>
          <p className="text-sm text-stone-400">
            {t.cycleLedgerIntro}
          </p>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.28em] text-stone-500">
              <tr className="border-b border-white/8">
                <th className="px-3 py-3">{t.cycle}</th>
                <th className="px-3 py-3">{t.athDate}</th>
                <th className="px-3 py-3">{t.athPrice}</th>
                <th className="px-3 py-3">{t.lowDate}</th>
                <th className="px-3 py-3">{t.lowPrice}</th>
                <th className="px-3 py-3">{t.days}</th>
                <th className="px-3 py-3 text-right">{t.drawdown}</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr
                  key={cycle.id}
                  className={cn(
                    "border-b border-white/6",
                    cycle.isCurrent && "bg-primary/[0.04]"
                  )}
                >
                  <td className={cn("px-3 py-4 font-semibold", cycle.isCurrent ? "text-primary" : "text-white")}>
                    {cycle.isCurrent
                      ? t.currentCycle
                      : language === "ro"
                        ? cycle.label.replace("Cycle ", "Ciclu ")
                        : cycle.label}
                  </td>
                  <td className="px-3 py-4 text-stone-300">{formatDate(cycle.athDate, language)}</td>
                  <td className="px-3 py-4 text-white">{formatCurrency(cycle.athPrice)}</td>
                  <td className="px-3 py-4 text-stone-300">{formatDate(cycle.lowDate, language)}</td>
                  <td className="px-3 py-4 text-white">
                    {cycle.lowPrice !== null ? formatCurrency(cycle.lowPrice) : t.inProgress}
                  </td>
                  <td className="px-3 py-4 text-stone-300">
                    {cycle.daysToBottom !== null ? `${cycle.daysToBottom}d` : t.live}
                  </td>
                  <td className="px-3 py-4 text-right font-semibold text-red-300">
                    {formatPercent((cycle.isCurrent ? cycle.currentDrawdown : cycle.drawdown) * 100, 1)}
                  </td>
                </tr>
              ))}

              <tr className="bg-emerald-500/[0.05]">
                <td className="px-3 py-4 font-semibold text-emerald-300">{t.projectedBottomRow}</td>
                <td className="px-3 py-4 text-stone-300">
                  {localizedProjectionModels.find((model) => model.id === selectedModel?.id)?.label ?? selectedModel?.label}
                </td>
                <td className="px-3 py-4 text-white">{formatCurrency(currentAth)}</td>
                <td className="px-3 py-4 text-stone-300">{t.future}</td>
                <td className="px-3 py-4 text-emerald-300">{formatCurrency(projectedBottom)}</td>
                <td className="px-3 py-4 text-stone-300">
                  {daysSinceAth}d {t.elapsed} / ~{Math.round(cycleMetrics.avgDays || 0)}d {t.average}
                </td>
                <td className="px-3 py-4 text-right font-semibold text-emerald-300">
                  {formatPercent(projectedDropPercent, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
              {t.aiCycleAnalyst}
            </p>
            <h2 className="mt-2 font-display text-4xl text-white">{t.regimeLayer}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
              {t.aiIntro}
            </p>
          </div>

          <Button
            variant="outline"
            size="md"
            className="rounded-2xl"
            onClick={() => void runAnalysis()}
            disabled={analysisLoading || (!canGenerateNewReport && !!report)}
          >
            <SearchCheck className={cn("h-4 w-4", analysisLoading && "animate-pulse")} />
            {t.refreshAiRead}
          </Button>
        </div>

        {(lastGeneratedAt || lastGeneratedPrice || lastGeneratedAth) && (
          <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 text-sm leading-6 text-stone-300">
    {t.lastSavedReport}:
            {" "}
            {lastGeneratedAt ? formatDate(lastGeneratedAt, language) : "-"}
            {" · BTC "}
            {lastGeneratedPrice !== null ? formatCurrency(lastGeneratedPrice, 0) : "-"}
            {" · ATH "}
            {lastGeneratedAth !== null ? formatCurrency(lastGeneratedAth, 0) : "-"}
            {selectedReportId && reportHistory.find((item) => item.id === selectedReportId) && (
              <>
                {" · "}
                {t.generatedIn}: {reportHistory.find((item) => item.id === selectedReportId)?.language.toUpperCase()}
              </>
            )}
            {currentDropFromLastReport !== null && (
              <>
                {" · "}
                {t.currentDropVsLast}: {formatPercent(currentDropFromLastReport, 2)}
              </>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
              {t.minDropNeeded}
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">-{MIN_DROP_TO_REFRESH}%</p>
            <p className="mt-1 text-sm text-stone-400">{t.generateUnlock}</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
              {t.currentDropVsLast}
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {currentDropFromLastReport !== null ? formatPercent(currentDropFromLastReport, 2) : "-"}
            </p>
            <p className="mt-1 text-sm text-stone-400">
              {canGenerateNewReport ? t.ready : t.stillLocked}
            </p>
          </div>
        </div>

        {analysisError ? (
          <div className="mt-6 rounded-[1.5rem] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-200">
            {analysisError}
          </div>
        ) : analysisLoading && !report ? (
          <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 text-sm text-stone-300">
            {t.generatingAi}
          </div>
        ) : savedReportLoading && !report ? (
          <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 text-sm leading-6 text-stone-300">
            {t.loadSavedReport}
          </div>
        ) : !report ? (
          <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 text-sm leading-6 text-stone-300">
            {t.generateHint}
          </div>
        ) : report ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                      {t.marketRegime}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">{regimeLabel(report.marketRegime)}</h3>
                  </div>
                  <div className="rounded-[1.1rem] border border-primary/20 bg-primary/10 px-4 py-3 text-right">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-stone-500">{t.confidence}</p>
                    <p className="mt-1 text-2xl font-semibold text-primary">{Math.round(report.confidence)}%</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-stone-300">{report.executiveSummary}</p>
                <div className="mt-5 rounded-[1.35rem] border border-white/8 bg-black/10 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500">
                    {t.closestHistoricalMatch}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white">{report.historicalMatch}</p>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 text-primary">
                  <ShieldAlert className="h-4 w-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em]">
                    {t.invalidationMap}
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {report.invalidationSignals.map((item) => (
                    <div key={item} className="rounded-[1.25rem] border border-white/8 bg-black/10 px-4 py-3 text-sm leading-6 text-stone-300">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                  {t.whyModel}
                </p>
                <div className="mt-4 space-y-3">
                  {report.evidence.map((item) => (
                    <div key={item} className="rounded-[1.25rem] border border-white/8 bg-black/10 px-4 py-3 text-sm leading-6 text-stone-300">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                  {t.watchNext}
                </p>
                <div className="mt-4 space-y-3">
                  {report.watchNext.map((item) => (
                    <div key={item} className="rounded-[1.25rem] border border-white/8 bg-black/10 px-4 py-3 text-sm leading-6 text-stone-300">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                  {t.sourceNotes}
                </p>
                <div className="mt-4 space-y-3">
                  {report.sourceNotes.map((item) => (
                    <div key={item} className="rounded-[1.25rem] border border-white/8 bg-black/10 px-4 py-3 text-sm leading-6 text-stone-300">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {reportHistory.find((item) => item.id === selectedReportId)?.evaluations?.length ? (
                <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                    {t.evaluations}
                  </p>
                  <div className="mt-4 space-y-3">
                    {reportHistory
                      .find((item) => item.id === selectedReportId)
                      ?.evaluations?.map((evaluation) => (
                        <div
                          key={evaluation.id}
                          className="rounded-[1.25rem] border border-white/8 bg-black/10 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">
                              {t.horizon}: {evaluation.horizonDays}d
                            </p>
                            <span className="text-sm font-semibold text-primary">
                              {verdictLabel(evaluation.verdict)}
                            </span>
                          </div>
                          {evaluation.notes && (
                            <p className="mt-2 text-sm leading-6 text-stone-400">{evaluation.notes}</p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-6 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-stone-500">
              {t.reportHistory}
            </p>
            <h2 className="mt-2 font-display text-4xl text-white">{t.reportHistory}</h2>
          </div>
          <p className="text-sm text-stone-400">
            {t.latestSnapshots}
          </p>
        </div>

        <div className="mt-6 overflow-x-auto">
          {reportHistory.length === 0 ? (
            <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 text-sm text-stone-300">
              {t.noHistoryYet}
            </div>
          ) : (
            <>
              <table className="min-w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.28em] text-stone-500">
                  <tr className="border-b border-white/8">
                    <th className="px-3 py-3">{t.marketRegime}</th>
                    <th className="px-3 py-3">{t.generatedIn}</th>
                    <th className="px-3 py-3">{t.confidence}</th>
                    <th className="px-3 py-3">{t.snapshotGenerated}</th>
                    <th className="px-3 py-3">{t.currentPrice}</th>
                    <th className="px-3 py-3">{t.currentAth}</th>
                    <th className="px-3 py-3 text-right">{t.loadReport}</th>
                  </tr>
                </thead>
                <tbody>
                  {reportHistory.map((item) => (
                    <tr key={item.id} className="border-b border-white/6">
                      <td className="px-3 py-4 font-semibold text-white">{regimeLabel(item.marketRegime)}</td>
                      <td className="px-3 py-4 text-stone-300">{item.language.toUpperCase()}</td>
                      <td className="px-3 py-4 text-stone-300">{Math.round(item.confidence)}%</td>
                      <td className="px-3 py-4 text-stone-300">{formatDate(item.generatedAt, language)}</td>
                      <td className="px-3 py-4 text-white">{formatCurrency(item.snapshotPrice)}</td>
                      <td className="px-3 py-4 text-white">{formatCurrency(item.snapshotAth)}</td>
                      <td className="px-3 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => setSelectedReportId(item.id)}
                        >
                          {t.loadReport}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-5 flex items-center justify-between gap-4">
                <p className="text-sm text-stone-400">
                  {t.page} {pagination.page} / {pagination.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    disabled={pagination.page <= 1}
                    onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                  >
                    {t.previous}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setHistoryPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                  >
                    {t.next}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
