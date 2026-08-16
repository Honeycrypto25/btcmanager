export const dynamic = "force-dynamic";

import React from "react";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getReceipt } from "@/app/actions/receipts";
import { listVehicles } from "@/app/actions/vehicles";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { ReceiptDetailClient } from "@/components/self-employed/ReceiptDetailClient";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/signin");

    const { id } = await params;

    let receipt;
    try {
        receipt = await getReceipt(id);
    } catch {
        notFound();
    }

    const vehicles = await listVehicles();

    const serialized = {
        id: receipt.id,
        merchant: receipt.merchant,
        receiptDate: receipt.receiptDate ? receipt.receiptDate.toISOString() : null,
        receiptTime: receipt.receiptTime,
        amount: receipt.amount !== null ? Number(receipt.amount) : null,
        vatAmount: receipt.vatAmount !== null ? Number(receipt.vatAmount) : null,
        currency: receipt.currency,
        category: receipt.category,
        description: receipt.description,
        paymentMethod: receipt.paymentMethod,
        status: receipt.status,
        aiProcessed: receipt.aiProcessed,
        ocrRawText: receipt.ocrRawText,
        originalMimeType: receipt.originalMimeType,
        hasPreview: !!receipt.previewObjectKey,
        vehicleId: receipt.vehicleId,
        vehicleMileage: receipt.vehicleMileage,
        fuelQuantityLitres: receipt.fuelQuantityLitres !== null ? Number(receipt.fuelQuantityLitres) : null,
        isFullTank: receipt.isFullTank,
        convertedExpenseId: receipt.convertedExpenseId,
    };

    const vehicleOptions = vehicles.map((v: any) => ({ id: v.id, name: v.name }));

    return (
        <DashboardLayout>
            <ReceiptDetailClient receipt={serialized} categories={[...EXPENSE_CATEGORIES]} vehicles={vehicleOptions} />
        </DashboardLayout>
    );
}
