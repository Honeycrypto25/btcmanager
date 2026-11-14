export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getBotActivity } from "@/lib/bot-activity";
import { BotActClient, type BotActivityDTO } from "@/components/bot-act/BotActClient";

// Admin-only: aggregates every bot section (Solana, Base, BNB, EVA, Polygon).
export default async function BotActPage() {
    const session = await requireAdminPage();
    const userId = (session.user as { id?: string } | undefined)?.id;
    const bots = userId ? await getBotActivity(userId) : [];

    return (
        <DashboardLayout>
            <BotActClient bots={JSON.parse(JSON.stringify(bots)) as BotActivityDTO[]} />
        </DashboardLayout>
    );
}
