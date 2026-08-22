export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getTaxEstimate } from "@/app/actions/tax";
import { getCurrentUkTaxYear, listRecentUkTaxYears } from "@/lib/tax/uk-tax-year";
import { TaxClient } from "@/components/self-employed/TaxClient";

export default async function TaxPage({
    searchParams,
}: {
    searchParams: Promise<{ taxYear?: string }>;
}) {
    const session = await requireSectionAccess("selfEmployed");

    const params = await searchParams;
    const taxYears = listRecentUkTaxYears(5);
    const taxYear = params.taxYear && taxYears.includes(params.taxYear) ? params.taxYear : getCurrentUkTaxYear();

    const estimate = await getTaxEstimate({ taxYear });

    return (
        <DashboardLayout>
            <TaxClient initialEstimate={estimate} taxYears={taxYears} />
        </DashboardLayout>
    );
}
