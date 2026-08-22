import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

// Coarse sections a viewer's access can be scoped to — one per sidebar
// group that shows real data. Deliberately excludes "Overview" (aggregates
// figures across every section, so it can't be shown to a partial viewer
// without leaking sections they don't have) and "Tasks"/"Admin" (personal
// dev-tracker and security settings — never useful or safe for a viewer).
export const SECTION_KEYS = [
    "btc",
    "t212",
    "investments",
    "solana",
    "base",
    "bnb",
    "selfEmployed",
    "vehicles",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
    btc: "Bitcoin",
    t212: "Trading 212",
    investments: "Investiții (Vanguard, Goals)",
    solana: "Solana DCA",
    base: "Base (ETH) DCA",
    bnb: "BNB Chain DCA",
    selfEmployed: "Self Employed / Taxe",
    vehicles: "Vehicule & Documente",
};

export function isSectionKey(value: string): value is SectionKey {
    return (SECTION_KEYS as readonly string[]).includes(value as SectionKey);
}

type SessionUser = {
    isAdmin?: boolean;
    allowedSections?: string[];
};

/**
 * Guard for every mutating server action. The admin (ADMIN_EMAILS) can do
 * anything; a viewer (ViewerAccess row) can only ever read — every
 * create/update/delete action in src/app/actions/*.ts calls this first.
 */
export async function requireAdmin(): Promise<void> {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.isAdmin) {
        throw new Error("Doar administratorul poate face această acțiune. Contul tău are acces doar de vizualizare.");
    }
}

/**
 * Guard for a page that belongs to one dashboard section. Admin always
 * passes. A viewer passes only if this section is in their allow-list;
 * otherwise they're bounced to their first allowed section (or a
 * no-access page, which shouldn't normally happen since a ViewerAccess
 * row is only created with at least one section checked).
 */
export async function requireSectionAccess(section: SectionKey) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const user = session.user as SessionUser;
    if (user.isAdmin) return session;

    const allowed = user.allowedSections ?? [];
    if (allowed.includes(section)) return session;

    const fallback = allowed.find(isSectionKey);
    redirect(fallback ? sectionHomeHref(fallback) : "/no-access");
}

/** First page to send a viewer to for a given section (matches Sidebar hrefs). */
export function sectionHomeHref(section: SectionKey): string {
    switch (section) {
        case "btc": return "/btc";
        case "t212": return "/t212";
        case "investments": return "/investments";
        case "solana": return "/solana";
        case "base": return "/base";
        case "bnb": return "/bnb";
        case "selfEmployed": return "/self-employed";
        case "vehicles": return "/vehicles";
    }
}

/** Admin-only page guard (Overview, Tasks, Admin settings). */
export async function requireAdminPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");
    const user = session.user as SessionUser;
    if (!user.isAdmin) {
        const fallback = (user.allowedSections ?? []).find(isSectionKey);
        redirect(fallback ? sectionHomeHref(fallback) : "/no-access");
    }
    return session;
}
