import "server-only";

/** FCSB on TheSportsDB (https://www.thesportsdb.com/team/134005-fcsb). */
export const FCSB_TEAM_ID = 134005;
const BASE = "https://www.thesportsdb.com/api/v1/json";

export interface SportsDbEvent {
    idEvent: string;
    strLeague?: string | null;
    strSeason?: string | null;
    intRound?: string | null;
    strHomeTeam: string;
    strAwayTeam: string;
    idHomeTeam: string;
    idAwayTeam: string;
    intHomeScore?: string | null;
    intAwayScore?: string | null;
    strTimestamp?: string | null;
    dateEvent?: string | null;
    strTime?: string | null;
    strStatus?: string | null;
    strVenue?: string | null;
}

export interface NormalizedFixture {
    apiId: number;
    season: number;
    kickoff: Date;
    league: string;
    round: string | null;
    homeId: number;
    homeName: string;
    awayId: number;
    awayName: string;
    homeGoals: number | null;
    awayGoals: number | null;
    statusShort: string;
    statusLong: string;
    venue: string | null;
}

const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function kickoffOf(e: SportsDbEvent): Date | null {
    const raw = e.strTimestamp || (e.dateEvent ? `${e.dateEvent}T${e.strTime || "00:00:00"}` : null);
    if (!raw) return null;
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`); // TheSportsDB times are UTC
    return Number.isNaN(d.getTime()) ? null : d;
}

function normalize(e: SportsDbEvent): NormalizedFixture | null {
    const kickoff = kickoffOf(e);
    const apiId = num(e.idEvent);
    const homeId = num(e.idHomeTeam);
    const awayId = num(e.idAwayTeam);
    if (!kickoff || apiId == null || homeId == null || awayId == null) return null;
    const homeGoals = num(e.intHomeScore);
    const awayGoals = num(e.intAwayScore);
    const played = homeGoals != null && awayGoals != null;
    const status = e.strStatus ?? "";
    const postponed = /postp|cancel|abandon/i.test(status);
    return {
        apiId,
        season: parseInt(e.strSeason ?? "", 10) || kickoff.getUTCFullYear(),
        kickoff,
        league: e.strLeague ?? "—",
        round: e.intRound ? `Runda ${e.intRound}` : null,
        homeId,
        homeName: e.strHomeTeam,
        awayId,
        awayName: e.strAwayTeam,
        homeGoals,
        awayGoals,
        statusShort: played ? "FT" : postponed ? "PST" : "NS",
        statusLong: played ? "Încheiat" : postponed ? "Amânat / anulat" : "Programat",
        venue: e.strVenue ?? null,
    };
}

async function get(path: string): Promise<{ events: SportsDbEvent[]; error: string | null }> {
    const key = process.env.THESPORTSDB_KEY || "123"; // "123" is TheSportsDB's public test key
    const res = await fetch(`${BASE}/${key}/${path}`, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) return { events: [], error: `TheSportsDB a răspuns cu HTTP ${res.status}.` };
    let json: { events?: SportsDbEvent[] | null; results?: SportsDbEvent[] | null };
    try {
        json = JSON.parse(text);
    } catch {
        return { events: [], error: text.slice(0, 200) || "Răspuns necunoscut de la TheSportsDB." };
    }
    return { events: json.events ?? json.results ?? [], error: null };
}

/** Next and last matches of a team. Free plan: a handful of each per call, so history builds up over repeated syncs. */
export async function fetchTeamMatches(teamId: number): Promise<{ fixtures: NormalizedFixture[]; error: string | null }> {
    const [next, last] = await Promise.all([get(`eventsnext.php?id=${teamId}`), get(`eventslast.php?id=${teamId}`)]);
    const error = next.error && last.error ? `${next.error} ${last.error}` : null;
    const fixtures = [...next.events, ...last.events].map(normalize).filter((f): f is NormalizedFixture => f !== null);
    return { fixtures, error };
}
