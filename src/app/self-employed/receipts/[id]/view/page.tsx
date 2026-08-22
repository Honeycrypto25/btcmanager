export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { requireSectionAccess, requireAdminPage } from "@/lib/permissions";
import { getReceipt } from "@/app/actions/receipts";
import { ReceiptImageViewer } from "@/components/self-employed/ReceiptImageViewer";

/** Read-only "just the photo" view of a receipt, separate from the editable
 * detail page at /self-employed/receipts/[id] -- reached via the Eye/"View"
 * action on Expenses rows and the accounting export's receipt links, so
 * looking up a receipt doesn't drop the user into an edit form by accident. */
export default async function ReceiptImageViewPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await requireSectionAccess("selfEmployed");

    const { id } = await params;

    let receipt;
    try {
        receipt = await getReceipt(id);
    } catch {
        notFound();
    }

    const serialized = {
        id: receipt.id,
        merchant: receipt.merchant,
        receiptDate: receipt.receiptDate ? receipt.receiptDate.toISOString() : null,
        amount: receipt.amount !== null ? Number(receipt.amount) : null,
        currency: receipt.currency,
        originalMimeType: receipt.originalMimeType,
    };

    return <ReceiptImageViewer receipt={serialized} />;
}
