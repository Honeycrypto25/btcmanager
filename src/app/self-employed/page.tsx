export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getSelfEmployedSummary } from "@/app/actions/self-employed";
import { getCurrentUkTaxYear, listRecentUkTaxYears } from "@/lib/tax/uk-tax-year";
import { SelfEmployedOverviewClient } from "@/components/self-employed/SelfEmployedOverviewClient";

export default async function SelfEmployedOverviewPage({
    searchParams,
}: {
    searchParams: Promise<{ taxYear?: string }>;
}) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const params = await searchParams;
    const taxYears = listRecentUkTaxYears(5);
    const taxYear = params.taxYear && taxYears.includes(params.taxYear) ? params.taxYear : getCurrentUkTaxYear();

    const summary = await getSelfEmployedSummary(taxYear);

    return (
        <DashboardLayout>
            <SelfEmployedOverviewClient summary={summary} taxYears={taxYears} />
        </DashboardLayout>
    );
}
