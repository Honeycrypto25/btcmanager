import "server-only";
import packageJson from "../../../package.json";

export interface DependencyRow {
    name: string;
    type: "dependency" | "devDependency";
    /** As declared in package.json (e.g. "^16.1.6"), with the range prefix stripped for display. */
    current: string;
    /** npm's "latest" dist-tag, or null if the registry lookup failed/timed out. */
    latest: string | null;
    /** How far behind `current` is from `latest` — null if unknown or already current. */
    behind: "patch" | "minor" | "major" | null;
}

/** Strips a semver range prefix (^, ~, >=, etc.) down to a bare "x.y.z", best-effort. */
function stripRange(spec: string): string {
    return spec.replace(/^[\^~>=<\s]+/, "").trim();
}

/** Parses "x.y.z..." into up to 3 numeric parts; non-numeric/missing parts become 0. */
function parseSemver(v: string): [number, number, number] {
    const parts = v.split(".").map((p) => parseInt(p, 10));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function diffLevel(current: string, latest: string): "patch" | "minor" | "major" | null {
    const [cMaj, cMin, cPat] = parseSemver(current);
    const [lMaj, lMin, lPat] = parseSemver(latest);
    if (lMaj > cMaj) return "major";
    if (lMaj === cMaj && lMin > cMin) return "minor";
    if (lMaj === cMaj && lMin === cMin && lPat > cPat) return "patch";
    return null; // current is equal to, or ahead of, latest
}

/**
 * Looks up a single package's "latest" dist-tag on the public npm registry.
 * Best-effort, "never throw" (vanguard/price.ts style) — a slow or missing
 * package shouldn't break the whole table, it just shows as "unknown" for
 * that one row. 8s per-request timeout so one hung lookup can't stall the
 * page indefinitely (Promise.all still waits for the slowest row either way,
 * but this caps how long that can be).
 */
async function fetchLatestVersion(name: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        // Scoped package names (e.g. "@aws-sdk/client-s3") need the slash
        // encoded, or the registry treats it as a path segment.
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
            signal: controller.signal,
            // Registry responses change constantly; never serve a stale cached copy.
            cache: "no-store",
            headers: { Accept: "application/vnd.npm.install-v1+json" }, // slimmer response — just versions/dist-tags, not full changelogs
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { "dist-tags"?: { latest?: string } };
        return data["dist-tags"]?.latest ?? null;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Reads package.json's dependencies/devDependencies and, for each one, asks
 * the public npm registry what the current "latest" published version is —
 * so the admin page can show, at a glance, which packages have fallen
 * behind and by how much. All lookups run in parallel; a failed/timed-out
 * lookup just shows "unknown" for that row rather than failing the page.
 */
export async function getDependencyStatus(): Promise<DependencyRow[]> {
    const deps = Object.entries(packageJson.dependencies ?? {}).map(([name, spec]) => ({
        name,
        spec: spec as string,
        type: "dependency" as const,
    }));
    const devDeps = Object.entries(packageJson.devDependencies ?? {}).map(([name, spec]) => ({
        name,
        spec: spec as string,
        type: "devDependency" as const,
    }));
    const all = [...deps, ...devDeps];

    const latestVersions = await Promise.all(all.map((d) => fetchLatestVersion(d.name)));

    const rows: DependencyRow[] = all.map((d, i) => {
        const current = stripRange(d.spec);
        const latest = latestVersions[i];
        return {
            name: d.name,
            type: d.type,
            current,
            latest,
            behind: latest ? diffLevel(current, latest) : null,
        };
    });

    // Most outdated first (major > minor > patch > up to date), then alphabetical within each group.
    const rank = { major: 0, minor: 1, patch: 2 } as const;
    return rows.sort((a, b) => {
        const ra = a.behind ? rank[a.behind] : 3;
        const rb = b.behind ? rank[b.behind] : 3;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
    });
}
