export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listRecentUkTaxYears } from "@/lib/tax/uk-tax-year";
import { buildAccountingExportZip } from "@/lib/export/accounting-export";

/** GET /api/self-employed/export?taxYear=2026-27 — downloads a ZIP
 * (income.csv + expenses.csv + summary.csv) for that tax year, scoped to
 * the signed-in user only. */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const taxYear = new URL(req.url).searchParams.get("taxYear");
    const validTaxYears = listRecentUkTaxYears(10);
    if (!taxYear || !validTaxYears.includes(taxYear)) {
        return NextResponse.json({ error: "An fiscal invalid." }, { status: 400 });
    }

    try {
        const zipBuffer = await buildAccountingExportZip(userId, taxYear);
        return new NextResponse(new Uint8Array(zipBuffer), {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="export-contabil-${taxYear}.zip"`,
            },
        });
    } catch (err: any) {
        console.error("Accounting export failed", err);
        return NextResponse.json({ error: err.message || "Exportul a eșuat." }, { status: 500 });
    }
}
