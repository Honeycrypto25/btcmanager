"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/permissions";

export interface EmailLogRow {
    id: string;
    type: string;
    chain: string | null;
    subject: string;
    recipient: string;
    status: string;
    errorMessage: string | null;
    createdAt: Date;
}

/** Admin-only — the email history isn't part of any viewer-accessible section. */
export async function listEmailLogs(limit = 200): Promise<EmailLogRow[]> {
    await requireAdmin();
    return db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
