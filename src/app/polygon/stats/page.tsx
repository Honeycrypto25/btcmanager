export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function PolygonStatsIndex() {
    const session = await getServerSession(authOptions);
    const user = session?.user as { isAdmin?: boolean; allowedSections?: string[] } | undefined;
    redirect(user?.isAdmin || user?.allowedSections?.includes("geod") || !user?.allowedSections?.includes("myst") ? "/polygon/geod/stats" : "/polygon/myst/stats");
}
