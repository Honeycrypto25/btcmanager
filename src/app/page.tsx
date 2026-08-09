export const dynamic = "force-dynamic";

import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getOverviewData } from "@/lib/overview-data";
import { OverviewClient } from "@/components/overview/OverviewClient";

export default async function OverviewPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const { data, usdToGbp } = await getOverviewData();

    return (
        <DashboardLayout>
            <OverviewClient data={data} usdToGbp={usdToGbp} />
        </DashboardLayout>
    );
}
