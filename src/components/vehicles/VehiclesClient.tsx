"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, X, Car, Gauge } from "lucide-react";
import { createVehicle, type VehicleInput } from "@/app/actions/vehicles";

interface VehicleRow {
    id: string;
    name: string;
    make: string | null;
    model: string | null;
    year: number | null;
    registrationNumber: string | null;
    fuelType: string | null;
    currentMileage: number | null;
    maintenanceStatus: string;
}

const emptyForm: VehicleInput = { name: "", make: "", model: "", registrationNumber: "", fuelType: "petrol" };

const statusDot: Record<string, string> = {
    red: "bg-red-400",
    amber: "bg-amber-400",
    green: "bg-green-400",
    none: "bg-white/20",
};

const statusLabel: Record<string, string> = {
    red: "Mentenanță restantă",
    amber: "Mentenanță curând",
    green: "Mentenanță la zi",
    none: "Fără mentenanță programată",
};

export function VehiclesClient({ initialVehicles }: { initialVehicles: VehicleRow[] }) {
    const router = useRouter();
    const [vehicles, setVehicles] = useState(initialVehicles);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<VehicleInput>(emptyForm);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submit() {
        if (!form.name.trim()) {
            setError("Numele vehiculului este obligatoriu.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const created = await createVehicle(form);
                setVehicles((prev) => [
                    ...prev,
                    {
                        id: created.id,
                        name: created.name,
                        make: created.make,
                        model: created.model,
                        year: created.year,
                        registrationNumber: created.registrationNumber,
                        fuelType: created.fuelType,
                        currentMileage: created.currentMileage,
                        maintenanceStatus: "none",
                    },
                ]);
                setForm(emptyForm);
                setShowForm(false);
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Vehicule</span>
                    </h1>
                    <p className="text-muted text-sm">{vehicles.length} vehicule</p>
                </div>
                <Button variant="primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showForm ? "Anulează" : "Adaugă vehicul"}
                </Button>
            </div>

            {showForm && (
                <Card className="p-5 sm:p-6 border-primary/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Nume (obligatoriu)</label>
                            <input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="ex. Skoda Octavia"
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Număr înmatriculare</label>
                            <input
                                value={form.registrationNumber}
                                onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Marcă</label>
                            <input
                                value={form.make}
                                onChange={(e) => setForm({ ...form, make: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Model</label>
                            <input
                                value={form.model}
                                onChange={(e) => setForm({ ...form, model: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">An fabricație</label>
                            <input
                                type="number"
                                value={form.year || ""}
                                onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || undefined })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Combustibil</label>
                            <select
                                value={form.fuelType}
                                onChange={(e) => setForm({ ...form, fuelType: e.target.value })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            >
                                <option value="petrol">Benzină</option>
                                <option value="diesel">Diesel</option>
                                <option value="electric">Electric</option>
                                <option value="hybrid">Hibrid</option>
                                <option value="other">Altul</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Kilometraj curent</label>
                            <input
                                type="number"
                                value={form.currentMileage || ""}
                                onChange={(e) => setForm({ ...form, currentMileage: parseInt(e.target.value) || undefined })}
                                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                    <div className="flex gap-2 mt-4">
                        <Button variant="primary" onClick={submit} disabled={isPending}>
                            {isPending ? "Se salvează..." : "Salvează"}
                        </Button>
                    </div>
                </Card>
            )}

            {vehicles.length === 0 ? (
                <Card className="p-16 text-center">
                    <Car className="w-6 h-6 mx-auto mb-2 opacity-40 text-faint" />
                    <p className="text-faint italic">Niciun vehicul adăugat încă.</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {vehicles.map((v) => (
                        <Card
                            key={v.id}
                            hover
                            className="p-5 cursor-pointer"
                            onClick={() => router.push(`/vehicles/${v.id}`)}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <p className="font-medium text-foreground">{v.name}</p>
                                    <p className="text-xs text-muted mt-0.5">
                                        {[v.make, v.model, v.year].filter(Boolean).join(" · ") || "—"}
                                    </p>
                                </div>
                                <Car className="w-4 h-4 text-faint" />
                            </div>
                            {v.registrationNumber && (
                                <p className="text-xs text-muted font-num mb-2">{v.registrationNumber}</p>
                            )}
                            {v.currentMileage !== null && (
                                <div className="flex items-center gap-1.5 text-xs text-muted mb-3">
                                    <Gauge className="w-3.5 h-3.5" />
                                    {v.currentMileage.toLocaleString()} mi
                                </div>
                            )}
                            <div className="flex items-center gap-2 pt-3 hairline-top">
                                <span className={cn("w-2 h-2 rounded-full", statusDot[v.maintenanceStatus])} />
                                <span className="text-xs text-muted">{statusLabel[v.maintenanceStatus]}</span>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
