"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions";

/** Drops the cached data of the loans page only (not the rest of the site); the client then re-renders it. */
export async function refreshLoansPage(): Promise<void> {
    await requireAdmin();
    revalidatePath("/cold-wallet/imprumuturi");
}
