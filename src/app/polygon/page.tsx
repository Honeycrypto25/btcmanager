export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// The single Polygon page was split into /polygon/geod and /polygon/myst — old links land on the first one the user may see.
export default async function PolygonIndex() {
    const session = await getServerSession(authOptions);
    const user = session?.user as { isAdmin?: boolean; allowedSections?: string[] } | undefined;
    redirect(user?.isAdmin || user?.allowedSections?.includes("geod") || !user?.allowedSections?.includes("myst") ? "/polygon/geod" : "/polygon/myst");
}
