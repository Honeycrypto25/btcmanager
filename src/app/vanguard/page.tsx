export const dynamic = "force-dynamic";

import React from "react";
import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listVanguardAccountsSerialized } from "@/app/actions/vanguard";
import { VanguardClient } from "@/components/vanguard/VanguardClient";

export default async function VanguardPage() {
    const session = await requireSectionAccess("investments");

    const serialized = await listVanguardAccountsSerialized("vanguard");

    return (
        <DashboardLayout>
            <VanguardClient initialAccounts={serialized} provider="vanguard" />
        </DashboardLayout>
    );
}
