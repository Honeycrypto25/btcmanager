"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { deleteDocumentObject } from "@/lib/r2/documents";

async function requireUserId(): Promise<string> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Unauthorized");
    return userId;
}

export interface DocumentDetailsInput {
    category?: string;
    title?: string;
    vehicleId?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    retentionUntil?: string | null;
    notes?: string;
}

/** The Document row itself is created by the upload API route (needs the
 * file + R2 key together). This updates the editable metadata afterwards. */
export async function updateDocumentDetails(id: string, input: DocumentDetailsInput) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.document.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    if (input.vehicleId) {
        const vehicle = await db.vehicle.findUnique({ where: { id: input.vehicleId } });
        if (!vehicle || vehicle.userId !== userId) throw new Error("Vehicle not found");
    }

    const document = await db.document.update({
        where: { id },
        data: {
            category: input.category ?? existing.category,
            title: input.title ?? existing.title,
            vehicleId: input.vehicleId === undefined ? existing.vehicleId : input.vehicleId,
            issueDate: input.issueDate !== undefined ? (input.issueDate ? new Date(input.issueDate) : null) : existing.issueDate,
            expiryDate: input.expiryDate !== undefined ? (input.expiryDate ? new Date(input.expiryDate) : null) : existing.expiryDate,
            retentionUntil: input.retentionUntil !== undefined ? (input.retentionUntil ? new Date(input.retentionUntil) : null) : existing.retentionUntil,
            notes: input.notes ?? existing.notes,
        },
    });

    revalidatePath("/documents");
    if (document.vehicleId) revalidatePath(`/vehicles/${document.vehicleId}`);
    return document;
}

/** Deletes the document row AND its R2 object. Only ever called explicitly
 * by the user — retentionUntil (see lib/documents/lifecycle.ts) only flags
 * a document as past-retention in the UI, it never triggers deletion on
 * its own. */
export async function deleteDocument(id: string) {
    await requireAdmin();
    const userId = await requireUserId();
    const existing = await db.document.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");

    await deleteDocumentObject(existing.objectKey);
    await db.document.delete({ where: { id } });

    revalidatePath("/documents");
    if (existing.vehicleId) revalidatePath(`/vehicles/${existing.vehicleId}`);
}

export async function listDocuments(filter?: { category?: string; vehicleId?: string }) {
    const userId = await requireUserId();
    return db.document.findMany({
        where: { userId, ...(filter?.category ? { category: filter.category } : {}), ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}) },
        orderBy: { createdAt: "desc" },
    });
}

export async function getDocument(id: string) {
    const userId = await requireUserId();
    const document = await db.document.findUnique({ where: { id } });
    if (!document || document.userId !== userId) throw new Error("Not found");
    return document;
}
