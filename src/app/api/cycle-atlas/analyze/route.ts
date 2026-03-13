import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    marketRegime: {
      type: "string",
      enum: ["Bear Market", "Transition", "Probable New Cycle", "Confirmed New Cycle"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },
    executiveSummary: {
      type: "string",
    },
    historicalMatch: {
      type: "string",
    },
    evidence: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    invalidationSignals: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    watchNext: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    sourceNotes: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
  },
  required: [
    "marketRegime",
    "confidence",
    "executiveSummary",
    "historicalMatch",
    "evidence",
    "invalidationSignals",
    "watchNext",
    "sourceNotes",
  ],
} as const;

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is missing on the server." },
      { status: 500 }
    );
  }

  const payload = await req.json();
  const language = payload?.language === "ro" ? "Romanian" : "English";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model: "gpt-5-mini",
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                `You are a Bitcoin cycle analyst. Use the provided structured data as the primary source of truth. Use web search only to add recent market context, not to override the math. Never give direct buy prices or financial advice. Focus on cycle interpretation, regime detection, and what would confirm or invalidate a new cycle. Write all free-text fields in ${language}. Keep them concise and clear.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyze this BTC cycle snapshot. Return only JSON that matches the schema exactly.\n\n${JSON.stringify(
                payload
              )}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "cycle_analyst_report",
          schema: analysisSchema,
          strict: true,
        },
      },
    });

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new Error("OpenAI returned an empty response.");
    }

    const report = JSON.parse(outputText);
    return NextResponse.json({ report });
  } catch (error) {
    console.error("Cycle analyst failed", error);
    return NextResponse.json(
      { error: "Failed to generate AI cycle analysis." },
      { status: 500 }
    );
  }
}
