"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { FCSB_TEAM_ID, fetchTeamMatches } from "@/lib/football/thesportsdb";

export interface FcsbSyncResult {
    ok: boolean;
    saved: number;
    message: string;
}

/**
 * Pulls FCSB's next and last matches from TheSportsDB and upserts them.
 * The free API returns only a few of each per call, so older results build
 * up in the database as the sync is run over time.
 */
export async function syncFcsbFixtures(): Promise<FcsbSyncResult> {
    await requireAdmin();
    const { fixtures, error } = await fetchTeamMatches(FCSB_TEAM_ID);
    if (error) return { ok: false, saved: 0, message: error };
    if (fixtures.length === 0) return { ok: false, saved: 0, message: "TheSportsDB nu a returnat niciun meci pentru FCSB." };
    for (const f of fixtures) {
        const { apiId, ...rest } = f;
        const data = { teamId: FCSB_TEAM_ID, ...rest, syncedAt: new Date() };
        await db.footballFixture.upsert({ where: { apiId }, create: { apiId, ...data }, update: data });
    }
    revalidatePath("/fcsb");
    return { ok: true, saved: fixtures.length, message: `${fixtures.length} meciuri salvate.` };
}
