import "server-only";
import { db } from "@/lib/db";

export type BotRunStatus = "ok" | "warn" | "error";

/** Maps a run result ({action, reason}) from any bot's cron cycle to a log status. */
export function statusFromResult(r: { action: string; reason?: string }): { status: BotRunStatus; message: string | null } {
    if (r.action === "error") return { status: "error", message: r.reason ?? null };
    if (r.action === "skipped") {
        // "next buy/sell due at …" = healthy, just not time yet. Anything else (low balance etc.) = the bot couldn't act.
        const routine = !r.reason || /^next (buy|sell) due/i.test(r.reason);
        return { status: routine ? "ok" : "warn", message: r.reason ?? null };
    }
    return { status: "ok", message: null }; // bought / sold
}

/** Best-effort: logging must never break a bot cycle. */
export async function logBotRun(userId: string, bot: string, r: { action: string; reason?: string }): Promise<void> {
    try {
        const { status, message } = statusFromResult(r);
        await db.botRun.create({ data: { userId, bot, status, message: message ? message.slice(0, 500) : null } });
    } catch (err) {
        console.error(`logBotRun failed for ${bot}`, err);
    }
}
