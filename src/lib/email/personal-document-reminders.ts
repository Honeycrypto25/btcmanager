import "server-only";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { pickActiveVersion, shouldSendReminderToday } from "@/lib/documents/personal-lifecycle";
import { buildReminderEmailHtml } from "@/lib/email/personal-document-templates";
import { logEmail } from "@/lib/email/email-log";

function getResendClient(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    return new Resend(apiKey);
}

function getRecipient(): string | null {
    // Same env var as the weekly/monthly portfolio reports — one admin
    // account, one inbox. See src/lib/email/send-report.ts.
    return process.env.REPORT_EMAIL_TO ?? null;
}

function getSender(): string {
    return process.env.REPORT_EMAIL_FROM ?? "Evama.net <reports@evama.net>";
}

function getDashboardUrl(): string {
    return process.env.NEXTAUTH_URL ?? "https://www.evama.net";
}

function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isSameUtcDay(a: Date, b: Date): boolean {
    return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

/**
 * Runs once/day via /api/cron/personal-document-reminders. For every
 * PersonalDocument whose ACTIVE version (see pickActiveVersion) has an
 * expiryDate, works out whether today is a reminder day (see
 * shouldSendReminderToday) and, if so and one hasn't already gone out
 * today, emails the account owner and stamps lastReminderSentAt.
 *
 * Deliberately never touches document data — this only ever reads and
 * sends email; the only write is the lastReminderSentAt stamp used to
 * avoid a double-send if the cron is re-triggered the same day.
 */
export async function sendPersonalDocumentReminders(): Promise<{ ok: true; sent: number; checked: number } | { ok: false; error: string }> {
    const resend = getResendClient();
    if (!resend) return { ok: false, error: "RESEND_API_KEY is not set" };
    const to = getRecipient();
    if (!to) return { ok: false, error: "REPORT_EMAIL_TO is not set" };

    const documents = await db.personalDocument.findMany({ include: { versions: true } });
    const today = startOfUtcDay(new Date());
    const dashboardUrl = getDashboardUrl();
    const sender = getSender();

    let sent = 0;
    let checked = 0;

    for (const doc of documents) {
        const active = pickActiveVersion(doc.versions);
        if (!active?.expiryDate) continue;
        checked++;

        if (doc.lastReminderSentAt && isSameUtcDay(doc.lastReminderSentAt, today)) continue;

        const daysUntilExpiry = Math.round((startOfUtcDay(active.expiryDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        if (!shouldSendReminderToday(daysUntilExpiry)) continue;

        const overdue = daysUntilExpiry < 0;
        const subject = overdue
            ? `Expirat: ${doc.title} (${doc.person})`
            : daysUntilExpiry === 0
            ? `Expiră astăzi: ${doc.title} (${doc.person})`
            : `Expiră în ${daysUntilExpiry} zile: ${doc.title} (${doc.person})`;

        const html = buildReminderEmailHtml({
            title: doc.title,
            person: doc.person,
            category: doc.category,
            expiryDate: active.expiryDate,
            daysUntilExpiry,
            dashboardUrl,
        });

        try {
            const result = await resend.emails.send({ from: sender, to, subject, html });
            if (result.error) {
                await logEmail({ type: "DOCUMENT_REMINDER", subject, recipient: to, status: "FAILED", errorMessage: result.error.message });
                continue;
            }
            await db.personalDocument.update({ where: { id: doc.id }, data: { lastReminderSentAt: new Date() } });
            await logEmail({ type: "DOCUMENT_REMINDER", subject, recipient: to, status: "SENT" });
            sent++;
        } catch (err: any) {
            await logEmail({ type: "DOCUMENT_REMINDER", subject, recipient: to, status: "FAILED", errorMessage: err?.message ?? "unknown error" });
        }
    }

    return { ok: true, sent, checked };
}
