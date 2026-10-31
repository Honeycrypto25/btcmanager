import "server-only";

export const FCSB_TEAM_ID = 559;
const BASE = "https://v3.football.api-sports.io";

export interface ApiFixture {
    fixture: { id: number; date: string; venue?: { name?: string | null } | null; status: { long: string; short: string } };
    league: { name: string; season: number; round?: string | null };
    teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    goals: { home: number | null; away: number | null };
}

interface ApiResponse {
    errors?: unknown;
    results?: number;
    response?: ApiFixture[];
}

/** API-Football season = the year the season starts (2026 = 2026/27). */
export function currentSeason(now = new Date()): number {
    return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function errorText(errors: unknown): string | null {
    if (!errors) return null;
    if (Array.isArray(errors)) return errors.length ? errors.map(String).join("; ") : null;
    if (typeof errors === "object") {
        const vals = Object.values(errors as Record<string, unknown>).map(String);
        return vals.length ? vals.join("; ") : null;
    }
    return String(errors);
}

/** One season of fixtures for a team (all competitions). Returns an error message instead of throwing on API-level errors (plan / season limits, quota). */
export async function fetchTeamFixtures(teamId: number, season: number): Promise<{ fixtures: ApiFixture[]; error: string | null }> {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) return { fixtures: [], error: "API_FOOTBALL_KEY nu este setată." };
    const res = await fetch(`${BASE}/fixtures?team=${teamId}&season=${season}`, {
        headers: { "x-apisports-key": key },
        cache: "no-store",
    });
    if (!res.ok) return { fixtures: [], error: `API-Football a răspuns cu HTTP ${res.status}.` };
    const json = (await res.json()) as ApiResponse;
    const err = errorText(json.errors);
    return { fixtures: err ? [] : json.response ?? [], error: err };
}
