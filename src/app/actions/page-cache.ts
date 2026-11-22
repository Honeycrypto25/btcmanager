"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { expirePageCache } from "@/lib/page-cache";

/** Refresh button: drop the cached page data so the next render loads everything fresh. */
export async function refreshCachedPages(): Promise<void> {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");
    expirePageCache();
}
