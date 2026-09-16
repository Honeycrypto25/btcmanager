export const dynamic = "force-dynamic";

import React from "react";
import { requireSectionAccess } from "@/lib/permissions";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listPersonalDocuments, listKnownPersons } from "@/app/actions/personal-documents";
import { isR2Configured } from "@/lib/r2/client";
import { PersonalDocumentsClient } from "@/components/personal-documents/PersonalDocumentsClient";

export default async function PersonalDocumentsPage() {
    await requireSectionAccess("documents");

    const [documents, knownPersons] = await Promise.all([listPersonalDocuments(), listKnownPersons()]);

    const serialized = documents.map((d: any) => ({
        id: d.id,
        person: d.person,
        title: d.title,
        category: d.category,
        notes: d.notes,
        createdAt: d.createdAt.toISOString(),
        versions: d.versions.map((v: any) => ({
            id: v.id,
            issueDate: v.issueDate ? v.issueDate.toISOString() : null,
            expiryDate: v.expiryDate ? v.expiryDate.toISOString() : null,
            originalMimeType: v.originalMimeType,
            fileSize: v.fileSize,
            createdAt: v.createdAt.toISOString(),
        })),
    }));

    return (
        <DashboardLayout>
            <PersonalDocumentsClient initialDocuments={serialized} knownPersons={knownPersons} r2Configured={isR2Configured()} />
        </DashboardLayout>
    );
}
