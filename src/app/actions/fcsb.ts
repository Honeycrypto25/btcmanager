"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { FCSB_TEAM_ID, currentSeason, fetchTeamFixtures } from "@/lib/football/api-football";

export interface FcsbSyncResult {
    ok: boolean;
    saved: number;
    message: string;
}

/**
 * Pulls FCSB's fixtures for the current and previous season from API-Football
 * and upserts them. Two API calls per sync, well inside the free 100/day.
 * A season the plan doesn't allow is reported, not fatal.
 */
export async function syncFcsbFixtures(): Promise<FcsbSyncResult> {
    await requireAdmin();
    const seasons = [currentSeason(), currentSeason() - 1];
    let saved = 0;
    const problems: string[] = [];
    for (const season of seasons) {
        const { fixtures, error } = await fetchTeamFixtures(FCSB_TEAM_ID, season);
        if (error) {
            problems.push(`Sezon ${season}: ${error}`);
            continue;
        }
        for (const f of fixtures) {
            const data = {
                teamId: FCSB_TEAM_ID,
                season: f.league.season,
                kickoff: new Date(f.fixture.date),
                league: f.league.name,
                round: f.league.round ?? null,
                homeId: f.teams.home.id,
                homeName: f.teams.home.name,
                awayId: f.teams.away.id,
                awayName: f.teams.away.name,
                homeGoals: f.goals.home,
                awayGoals: f.goals.away,
                statusShort: f.fixture.status.short,
                statusLong: f.fixture.status.long,
                venue: f.fixture.venue?.name ?? null,
                syncedAt: new Date(),
            };
            await db.footballFixture.upsert({ where: { apiId: f.fixture.id }, create: { apiId: f.fixture.id, ...data }, update: data });
            saved++;
        }
    }
    revalidatePath("/fcsb");
    if (saved === 0 && problems.length) return { ok: false, saved, message: problems.join(" · ") };
    return { ok: true, saved, message: `${saved} meciuri salvate.${problems.length ? " " + problems.join(" · ") : ""}` };
}
