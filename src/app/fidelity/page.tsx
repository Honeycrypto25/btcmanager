export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listVanguardAccountsSerialized } from "@/app/actions/vanguard";
import { VanguardClient } from "@/components/vanguard/VanguardClient";

export default async function FidelityPage() {
    const session = await requireSectionAccess("investments");

    const serialized = await listVanguardAccountsSerialized("fidelity");

    return (
        <DashboardLayout>
            <VanguardClient initialAccounts={serialized} provider="fidelity" />
        </DashboardLayout>
    );
}
