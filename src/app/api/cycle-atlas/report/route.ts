import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentBtcPrice } from "@/lib/btc";

export const runtime = "nodejs";

const EVALUATION_HORIZONS = [30, 90, 180];

function buildEvaluationVerdict(
  marketRegime: string,
  snapshotPrice: number,
  currentPrice: number
) {
  const change = ((currentPrice - snapshotPrice) / snapshotPrice) * 100;
  const bullishCall =
    marketRegime === "Probable New Cycle" || marketRegime === "Confirmed New Cycle";
  const bearishCall = marketRegime === "Bear Market";

  if (bullishCall) {
    if (change >= 10) {
      return { verdict: "validated", notes: `BTC is up ${change.toFixed(2)}% versus the report snapshot.` };
    }
    if (change <= -10) {
      return { verdict: "invalidated", notes: `BTC is down ${Math.abs(change).toFixed(2)}% versus the report snapshot.` };
    }
    return { verdict: "mixed", notes: `BTC moved ${change.toFixed(2)}% versus the report snapshot.` };
  }

  if (bearishCall) {
    if (change <= -10) {
      return { verdict: "validated", notes: `BTC is down ${Math.abs(change).toFixed(2)}% since the report.` };
    }
    if (change >= 10) {
      return { verdict: "invalidated", notes: `BTC is up ${change.toFixed(2)}% since the report.` };
    }
    return { verdict: "mixed", notes: `BTC changed ${change.toFixed(2)}% since the report.` };
  }

  if (Math.abs(change) < 8) {
    return { verdict: "mixed", notes: `BTC changed ${change.toFixed(2)}% since the report.` };
  }

  return {
    verdict: change > 0 ? "validated" : "invalidated",
    notes:
      change > 0
        ? `BTC is up ${change.toFixed(2)}% since the report.`
        : `BTC is down ${Math.abs(change).toFixed(2)}% since the report.`,
  };
}

async function ensureEvaluations(reportIds: string[], currentPrice: number) {
  if (reportIds.length === 0) return;

  const reports = await db.cycleAnalysisReport.findMany({
    where: { id: { in: reportIds } },
    include: { evaluations: true },
  });

  for (const report of reports) {
    for (const horizonDays of EVALUATION_HORIZONS) {
      const dueAt = new Date(report.generatedAt.getTime() + horizonDays * 24 * 60 * 60 * 1000);
      const existing = report.evaluations.find((evaluation) => evaluation.horizonDays === horizonDays);
      if (existing || dueAt > new Date()) continue;

      const { verdict, notes } = buildEvaluationVerdict(
        report.marketRegime,
        report.snapshotPrice,
        currentPrice
      );

      await db.cycleAnalysisEvaluation.create({
        data: {
          reportId: report.id,
          userId: report.userId,
          horizonDays,
          verdict,
          notes,
        },
      });
    }
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get("modelId") || "avg-last-3";
  const limit = Number(searchParams.get("limit") || 6);
  const page = Number(searchParams.get("page") || 1);
  const selectedId = searchParams.get("selectedId");
  const currentPrice = await getCurrentBtcPrice();

  const where = { userId: user.id, modelId };
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 20) : 6;
  const safePage = Number.isFinite(page) ? Math.max(page, 1) : 1;
  const skip = (safePage - 1) * safeLimit;

  const [reports, totalCount] = await Promise.all([
    db.cycleAnalysisReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
      include: {
        evaluations: {
          orderBy: { horizonDays: "asc" },
        },
      },
    }),
    db.cycleAnalysisReport.count({ where }),
  ]);

  await ensureEvaluations(reports.map((report) => report.id), currentPrice);

  const refreshedReports = await db.cycleAnalysisReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take: safeLimit,
    include: {
      evaluations: {
        orderBy: { horizonDays: "asc" },
      },
    },
  });

  const selectedReport = selectedId
    ? refreshedReports.find((report) => report.id === selectedId) ?? refreshedReports[0] ?? null
    : refreshedReports[0] ?? null;

  return NextResponse.json({
    report: selectedReport,
    reports: refreshedReports,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / safeLimit)),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();

  try {
    const created = await db.cycleAnalysisReport.create({
      data: {
        userId: user.id,
        language: body.language,
        modelId: body.modelId,
        marketRegime: body.report.marketRegime,
        confidence: body.report.confidence,
        executiveSummary: body.report.executiveSummary,
        historicalMatch: body.report.historicalMatch,
        evidence: body.report.evidence,
        invalidationSignals: body.report.invalidationSignals,
        watchNext: body.report.watchNext,
        sourceNotes: body.report.sourceNotes,
        snapshotPrice: body.snapshotPrice,
        snapshotAth: body.snapshotAth,
        generatedAt: new Date(body.generatedAt),
      },
    });

    return NextResponse.json({
      report: {
        ...created,
        evaluations: [],
      },
    });
  } catch (error) {
    console.error("Failed to save cycle analysis report", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to persist cycle analysis report.",
      },
      { status: 500 }
    );
  }
}
