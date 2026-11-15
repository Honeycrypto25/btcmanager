export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getApiUsageReport } from "@/lib/api-usage-report";
import { ApiUsageClient } from "@/components/admin/ApiUsageClient";

// Admin → Consum API: how many requests the platform sends to 1inch / Jupiter (own counters) and Alchemy (official usage API).
export default async function ApiUsagePage() {
    await requireAdminPage();
    const report = await getApiUsageReport();
    return (
        <DashboardLayout>
            <ApiUsageClient report={report} />
        </DashboardLayout>
    );
}
