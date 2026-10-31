export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { FCSB_TEAM_ID } from "@/lib/football/thesportsdb";
import { FcsbClient, type FixtureDTO } from "./FcsbClient";

export default async function FcsbPage() {
    await requireAdminPage();
    const rows = await db.footballFixture.findMany({ where: { teamId: FCSB_TEAM_ID }, orderBy: { kickoff: "asc" } });
    const fixtures: FixtureDTO[] = rows.map((r) => ({
        id: r.id,
        kickoff: r.kickoff.toISOString(),
        league: r.league,
        round: r.round,
        homeId: r.homeId,
        homeName: r.homeName,
        awayName: r.awayName,
        homeGoals: r.homeGoals,
        awayGoals: r.awayGoals,
        statusShort: r.statusShort,
        statusLong: r.statusLong,
        venue: r.venue,
    }));
    const lastSync = rows.reduce<Date | null>((m, r) => (!m || r.syncedAt > m ? r.syncedAt : m), null);
    return (
        <DashboardLayout>
            <FcsbClient fixtures={fixtures} teamId={FCSB_TEAM_ID} lastSync={lastSync?.toISOString() ?? null} />
        </DashboardLayout>
    );
}
