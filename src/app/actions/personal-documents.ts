"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { deletePersonalDocumentObject, getSignedPersonalDocumentUrl, getSignedPersonalDocumentShareUrl } from "@/lib/r2/personal-documents";
import { buildShareEmailHtml } from "@/lib/email/personal-document-templates";
import { logEmail } from "@/lib/email/email-log";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface PersonalDocumentDetailsInput {
    person?: string;
    title?: string;
    category?: string;
    notes?: string;
}

export async function listPersonalDocuments() {
    const userId = await requireUserId();
    return db.personalDocument.findMany({
        where: { userId },
        include: { versions: { orderBy: { createdAt: "desc" } } },
    });
}

export async function getPersonalDocument(id: string) {
    const userId = await requireUserId();
    const document = await db.personalDocument.findUnique({
        where: { id },
        include: { versions: { orderBy: { createdAt: "desc" } } },
    });
    if (!document || document.userId !== userId) throw new Error("Not found");
    return document;
}

/** Distinct person names already used, for the "person" field's
 * autocomplete — no fixed family-member list, per the user's choice. */
export async function listKnownPersons(): Promise<string[]> {
    const userId = await requireUserId();
    const rows = await db.personalDocument.findMany({ where: { userId }, select: { person: true }, distinct: ["person"] });
    return rows.map((r: any) => r.person).sort();
}

export async function updatePersonalDocumentDetails(id: string, input: PersonalDocumentDetailsInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.personalDocument.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    const document = await db.personalDocument.update({
        where: { id },
        data: {
            person: input.person?.trim() || existing.person,
            title: input.title?.trim() || existing.title,
            category: input.category ?? existing.category,
            notes: input.notes ?? existing.notes,
        },
    });

    revalidatePath("/personal-documents");
    return document;
}

/** Deletes the whole document — every version's R2 object plus the rows
 * (versions cascade). Only ever called explicitly by the user. */
export async function deletePersonalDocument(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.personalDocument.findUnique({ where: { id }, include: { versions: true } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    for (const v of existing.versions) {
        await deletePersonalDocumentObject(v.objectKey).catch(() => {});
    }
    await db.personalDocument.delete({ where: { id } });

    revalidatePath("/personal-documents");
}

/** Deletes a single old version (e.g. last year's renewal), keeping the
 * rest of the document's history. Refuses on the last remaining version —
 * use deletePersonalDocument instead to remove the whole document. */
export async function deletePersonalDocumentVersion(versionId: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const version = await db.personalDocumentVersion.findUnique({
        where: { id: versionId },
        include: { personalDocument: { include: { versions: true } } },
    });
    if (!version || version.personalDocument.userId !== userId) throw new Error("Not found");
    if (version.personalDocument.versions.length <= 1) {
        throw new Error("Nu poți șterge singura versiune — șterge documentul întreg în schimb.");
    }

    await deletePersonalDocumentObject(version.objectKey).catch(() => {});
    await db.personalDocumentVersion.delete({ where: { id: versionId } });

    revalidatePath("/personal-documents");
    return version.personalDocumentId;
}

/** Short-lived signed URL for viewing/downloading a version in-app. */
export async function getPersonalDocumentFileUrl(versionId: string): Promise<string> {
    const userId = await requireUserId();
    const version = await db.personalDocumentVersion.findUnique({
        where: { id: versionId },
        include: { personalDocument: true },
    });
    if (!version || version.personalDocument.userId !== userId) throw new Error("Not found");
    return getSignedPersonalDocumentUrl(version.objectKey);
}

function getResendClient(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    return new Resend(apiKey);
}

function getSender(): string {
    return process.env.REPORT_EMAIL_FROM ?? "Evama.net <reports@evama.net>";
}

const SHARE_LINK_EXPIRY_DAYS = 7;

/** Emails a time-limited (7-day) signed link to the given recipient —
 * never the file itself as an attachment, so a sensitive document (ID,
 * passport) doesn't sit permanently in someone else's inbox. */
export async function sharePersonalDocumentByEmail(versionId: string, recipientEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const userId = await requireUserId();
    const email = recipientEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Adresă de email invalidă." };

    const version = await db.personalDocumentVersion.findUnique({
        where: { id: versionId },
        include: { personalDocument: true },
    });
    if (!version || version.personalDocument.userId !== userId) throw new Error("Not found");

    const resend = getResendClient();
    if (!resend) return { ok: false, error: "RESEND_API_KEY nu este configurat." };

    try {
        const signedUrl = await getSignedPersonalDocumentShareUrl(version.objectKey, SHARE_LINK_EXPIRY_DAYS * 24 * 60 * 60);
        const html = buildShareEmailHtml({
            title: version.personalDocument.title,
            person: version.personalDocument.person,
            signedUrl,
            expiresInDays: SHARE_LINK_EXPIRY_DAYS,
        });
        const subject = `${version.personalDocument.title} — ${version.personalDocument.person}`;
        const result = await resend.emails.send({ from: getSender(), to: email, subject, html });
        if (result.error) {
            await logEmail({ type: "DOCUMENT_SHARE", subject, recipient: email, status: "FAILED", errorMessage: result.error.message });
            return { ok: false, error: result.error.message };
        }
        await logEmail({ type: "DOCUMENT_SHARE", subject, recipient: email, status: "SENT" });
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err?.message ?? "Trimiterea a eșuat." };
    }
}
