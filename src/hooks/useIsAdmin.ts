"use client";

import { useSession } from "next-auth/react";

/**
 * Client-side read of session.user.isAdmin — used purely for UX (hiding
 * edit/save/delete/sync buttons from a read-only viewer so they don't
 * click something that's already blocked server-side and get a confusing
 * 403). The real boundary is requireAdmin() in src/lib/permissions.ts,
 * called by every mutating server action/API route — this hook never
 * replaces that, it just keeps the UI honest about what will work.
 */
export function useIsAdmin(): boolean {
    const { data: session } = useSession();
    return Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
}
