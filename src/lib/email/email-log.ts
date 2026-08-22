import "server-only";
import { db } from "@/lib/db";

export type EmailType = "ORDER_PLACED" | "ORDER_FILLED" | "SWEEP" | "WEEKLY_REPORT" | "MONTHLY_REPORT";

/**
 * Records one attempted email send (success or failure) for the Admin >
 * "Emailuri" history tab. Called from tx-notify.ts and send-report.ts,
 * always AFTER the real Resend call — never blocks or fails the actual
 * send. Wrapped in its own try/catch since a logging failure must never
 * be mistaken for (or cause) an email failure.
 */
export async function logEmail(opts: {
    type: EmailType;
    chain?: string | null;
    subject: string;
    recipient: string;
    status: "SENT" | "FAILED";
    errorMessage?: string | null;
}): Promise<void> {
    try {
        await db.emailLog.create({
            data: {
                type: opts.type,
                chain: opts.chain ?? null,
                subject: opts.subject,
                recipient: opts.recipient,
                status: opts.status,
                errorMessage: opts.errorMessage ?? null,
            },
        });
    } catch (err) {
        console.error("Failed to write EmailLog row:", err);
    }
}
