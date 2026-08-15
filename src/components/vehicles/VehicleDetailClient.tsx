"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Plus, Trash2, X, Car, Fuel, Wrench, FileText, Gauge, Upload, ExternalLink } from "lucide-react";
import { createFuelEntry, deleteFuelEntry, createMaintenanceRecord, deleteMaintenanceRecord, deleteVehicle, type FuelEntryInput, type MaintenanceInput } from "@/app/actions/vehicles";
import { deleteDocument } from "@/app/actions/documents";

interface VehicleData {
    id: string;
    name: string;
    make: string | null;
    model: string | null;
    year: number | null;
    registrationNumber: string | null;
    fuelType: string | null;
    currentMileage: number | null;
    notes: string | null;
}

interface FuelEntryRow {
    id: string;
    date: string;
    mileage: number | null;
    quantity: number;
    unit: string;
    cost: number;
    pricePerUnit: number | null;
    isFullTank: boolean;
    station: string | null;
}

interface FuelStat {
    entryId: string;
    distanceMiles: number;
    litresUsed: number;
    cost: number;
    mpg: number;
    costPerMile: number;
}

interface MaintenanceRow {
    id: string;
    type: string;
    date: string;
    mileage: number | null;
    cost: number | null;
    provider: string | null;
    nextDueDate: string | null;
    nextDueMileage: number | null;
    status: string;
}

interface DocumentRow {
    id: string;
    category: string;
    title: string;
    expiryDate: string | null;
    createdAt: string;
}

function formatGBP(amount: number | null): string {
    if (amount === null) return "—";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(amount);
}

const statusStyles: Record<string, string> = {
    red: "bg-red-500/10 text-red-300 border-red-400/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-400/30",
    green: "bg-green-500/10 text-green-300 border-green-400/30",
    none: "bg-white/[0.04] text-muted border-border",
};
const statusLabels: Record<string, string> = {
    red: "Restant",
    amber: "În curând",
    green: "La zi",
    none: "—",
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider", statusStyles[status])}>
            {statusLabels[status]}
        </span>
    );
}

const inputClass = "w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary transition-colors";

type Tab = "overview" | "fuel" | "maintenance" | "documents";

export function VehicleDetailClient({ data }: { data: { vehicle: VehicleData; fuelEntries: FuelEntryRow[]; fuelStats: FuelStat[]; maintenance: MaintenanceRow[]; documents: DocumentRow[] } }) {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>("overview");
    const [fuelEntries, setFuelEntries] = useState(data.fuelEntries);
    const [maintenance, setMaintenance] = useState(data.maintenance);
    const [documents, setDocuments] = useState(data.documents);
    const [isPending, startTransition] = useTransition();

    const latestStat = data.fuelStats[data.fuelStats.length - 1];

    function removeVehicle() {
        if (!confirm(`Ștergi vehiculul "${data.vehicle.name}"? Se șterg și înregistrările de combustibil/mentenanță.`)) return;
        startTransition(async () => {
            await deleteVehicle(data.vehicle.id);
            router.push("/vehicles");
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">{data.vehicle.name}</span>
                    </h1>
                    <p className="text-muted text-sm">
                        {[data.vehicle.make, data.vehicle.model, data.vehicle.year, data.vehicle.registrationNumber].filter(Boolean).join(" · ") || "—"}
                    </p>
                </div>
                <Button variant="danger" size="sm" onClick={removeVehicle} disabled={isPending}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Șterge vehicul
                </Button>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1 w-fit">
                {([
                    ["overview", "Overview", Car],
                    ["fuel", "Combustibil", Fuel],
                    ["maintenance", "Mentenanță", Wrench],
                    ["documents", "Documente", FileText],
                ] as const).map(([key, label, Icon]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                            tab === key ? "bg-primary text-black" : "text-muted hover:bg-white/5 hover:text-foreground"
                        )}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {tab === "overview" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Kilometraj curent</p>
                            <Gauge className="w-4 h-4 text-primary" />
                        </div>
                        <p className="font-num text-2xl font-medium text-foreground">
                            {data.vehicle.currentMileage !== null ? `${data.vehicle.currentMileage.toLocaleString()} mi` : "—"}
                        </p>
                    </Card>
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Consum mediu (ultimul plin complet)</p>
                            <Fuel className="w-4 h-4 text-accent" />
                        </div>
                        <p className="font-num text-2xl font-medium text-foreground">{latestStat ? `${latestStat.mpg.toFixed(1)} mpg` : "—"}</p>
                        {latestStat && <p className="text-xs text-muted mt-1">{formatGBP(latestStat.costPerMile)}/milă</p>}
                    </Card>
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Mentenanță</p>
                            <Wrench className="w-4 h-4 text-red-400" />
                        </div>
                        <p className="text-sm text-muted">{maintenance.length} înregistrări · {documents.length} documente</p>
                    </Card>
                    {data.vehicle.notes && (
                        <Card className="p-5 sm:p-6 sm:col-span-2 lg:col-span-3">
                            <p className="text-xs text-muted uppercase tracking-wider mb-2">Notițe</p>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{data.vehicle.notes}</p>
                        </Card>
                    )}
                </div>
            )}

            {tab === "fuel" && (
                <FuelTab vehicleId={data.vehicle.id} entries={fuelEntries} setEntries={setFuelEntries} stats={data.fuelStats} />
            )}

            {tab === "maintenance" && (
                <MaintenanceTab vehicleId={data.vehicle.id} records={maintenance} setRecords={setMaintenance} />
            )}

            {tab === "documents" && (
                <DocumentsTab vehicleId={data.vehicle.id} documents={documents} setDocuments={setDocuments} />
            )}
        </div>
    );
}

function FuelTab({ vehicleId, entries, setEntries, stats }: { vehicleId: string; entries: FuelEntryRow[]; setEntries: React.Dispatch<React.SetStateAction<FuelEntryRow[]>>; stats: FuelStat[] }) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FuelEntryInput>({ vehicleId, date: new Date().toISOString().slice(0, 10), quantity: 0, cost: 0, isFullTank: true });
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submit() {
        if (!form.quantity || !form.cost) {
            setError("Cantitatea și costul sunt obligatorii.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const created = await createFuelEntry(form);
                setEntries((prev) => [
                    { id: created.id, date: created.date.toISOString(), mileage: created.mileage, quantity: Number(created.quantity), unit: created.unit, cost: Number(created.cost), pricePerUnit: created.pricePerUnit ? Number(created.pricePerUnit) : null, isFullTank: created.isFullTank, station: created.station },
                    ...prev,
                ]);
                setForm({ vehicleId, date: new Date().toISOString().slice(0, 10), quantity: 0, cost: 0, isFullTank: true });
                setShowForm(false);
                router_refresh();
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function router_refresh() {
        // Stats are computed server-side; a light refresh keeps them in sync without a full page reload UX hit.
        if (typeof window !== "undefined") window.location.reload();
    }

    function remove(id: string) {
        if (!confirm("Ștergi această alimentare?")) return;
        startTransition(async () => {
            await deleteFuelEntry(id);
            setEntries((prev) => prev.filter((e) => e.id !== id));
        });
    }

    const avgMpg = stats.length > 0 ? stats.reduce((s, x) => s + x.mpg, 0) / stats.length : null;
    const avgCostPerMile = stats.length > 0 ? stats.reduce((s, x) => s + x.costPerMile, 0) / stats.length : null;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-sm text-muted">
                    {avgMpg !== null ? `Medie: ${avgMpg.toFixed(1)} mpg · ${formatGBP(avgCostPerMile)}/milă` : "Nu există încă suficiente alimentări complete pentru calcul MPG."}
                </p>
                <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X className="w-3.5 h-3.5 mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                    {showForm ? "Anulează" : "Adaugă alimentare"}
                </Button>
            </div>

            {showForm && (
                <Card className="p-5 border-primary/30">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data</label>
                            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Kilometraj</label>
                            <input type="number" value={form.mileage || ""} onChange={(e) => setForm({ ...form, mileage: parseInt(e.target.value) || undefined })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Litri</label>
                            <input type="number" step="0.01" value={form.quantity || ""} onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cost total (GBP)</label>
                            <input type="number" step="0.01" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Benzinărie (opțional)</label>
                            <input value={form.station || ""} onChange={(e) => setForm({ ...form, station: e.target.value })} className={inputClass} />
                        </div>
                        <div className="flex items-end pb-3">
                            <label className="flex items-center gap-2 text-sm text-muted">
                                <input type="checkbox" checked={form.isFullTank} onChange={(e) => setForm({ ...form, isFullTank: e.target.checked })} />
                                Plin complet (necesar pentru calcul MPG)
                            </label>
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                    <div className="flex gap-2 mt-4">
                        <Button variant="primary" size="sm" onClick={submit} disabled={isPending}>
                            {isPending ? "Se salvează..." : "Salvează"}
                        </Button>
                    </div>
                </Card>
            )}

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Kilometraj</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Litri</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Cost</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {entries.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-16 text-center text-faint italic">Nicio alimentare înregistrată.</td></tr>
                            ) : (
                                entries.map((e) => (
                                    <tr key={e.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{format(new Date(e.date), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{e.mileage ? `${e.mileage.toLocaleString()} mi` : "—"}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{e.quantity.toFixed(2)} L {!e.isFullTank && <span className="text-faint">(parțial)</span>}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-foreground">{formatGBP(e.cost)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => remove(e.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function MaintenanceTab({ vehicleId, records, setRecords }: { vehicleId: string; records: MaintenanceRow[]; setRecords: React.Dispatch<React.SetStateAction<MaintenanceRow[]>> }) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<MaintenanceInput>({ vehicleId, type: "Service", date: new Date().toISOString().slice(0, 10) });
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submit() {
        if (!form.type.trim()) {
            setError("Tipul este obligatoriu.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                await createMaintenanceRecord(form);
                setForm({ vehicleId, type: "Service", date: new Date().toISOString().slice(0, 10) });
                setShowForm(false);
                if (typeof window !== "undefined") window.location.reload();
            } catch (e: any) {
                setError(e.message || "A apărut o eroare.");
            }
        });
    }

    function remove(id: string) {
        if (!confirm("Ștergi această înregistrare de mentenanță?")) return;
        startTransition(async () => {
            await deleteMaintenanceRecord(id);
            setRecords((prev) => prev.filter((r) => r.id !== id));
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X className="w-3.5 h-3.5 mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                    {showForm ? "Anulează" : "Adaugă mentenanță"}
                </Button>
            </div>

            {showForm && (
                <Card className="p-5 border-primary/30">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Tip (ex. MOT, Service, Anvelope)</label>
                            <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Data</label>
                            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Kilometraj</label>
                            <input type="number" value={form.mileage || ""} onChange={(e) => setForm({ ...form, mileage: parseInt(e.target.value) || undefined })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Cost (GBP, opțional)</label>
                            <input type="number" step="0.01" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || undefined })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Prestator (opțional)</label>
                            <input value={form.provider || ""} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={inputClass} />
                        </div>
                        <div />
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Următoarea dată scadentă (opțional)</label>
                            <input type="date" value={form.nextDueDate || ""} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} className={inputClass} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted">Kilometraj scadent (opțional)</label>
                            <input type="number" value={form.nextDueMileage || ""} onChange={(e) => setForm({ ...form, nextDueMileage: parseInt(e.target.value) || undefined })} className={inputClass} />
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
                    <div className="flex gap-2 mt-4">
                        <Button variant="primary" size="sm" onClick={submit} disabled={isPending}>
                            {isPending ? "Se salvează..." : "Salvează"}
                        </Button>
                    </div>
                </Card>
            )}

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Tip</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Cost</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Următoarea scadență</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {records.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-16 text-center text-faint italic">Nicio înregistrare de mentenanță.</td></tr>
                            ) : (
                                records.map((r) => (
                                    <tr key={r.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{r.type}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{format(new Date(r.date), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-sm text-foreground">{formatGBP(r.cost)}</td>
                                        <td className="px-6 py-4 text-sm text-muted">
                                            {r.nextDueDate ? format(new Date(r.nextDueDate), "dd MMM yyyy") : r.nextDueMileage ? `${r.nextDueMileage.toLocaleString()} mi` : "—"}
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function DocumentsTab({ vehicleId, documents, setDocuments }: { vehicleId: string; documents: DocumentRow[]; setDocuments: React.Dispatch<React.SetStateAction<DocumentRow[]>> }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [category, setCategory] = useState("Insurance");
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    async function handleFile(file: File) {
        setError(null);
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("category", category);
            formData.append("title", file.name);
            formData.append("vehicleId", vehicleId);
            const res = await fetch("/api/documents", { method: "POST", body: formData });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Upload eșuat.");
            setDocuments((prev) => [{ id: result.document.id, category: result.document.category, title: result.document.title, expiryDate: null, createdAt: new Date().toISOString() }, ...prev]);
        } catch (e: any) {
            setError(e.message || "A apărut o eroare la upload.");
        } finally {
            setUploading(false);
        }
    }

    async function viewDocument(id: string) {
        const res = await fetch(`/api/documents/${id}/file`);
        const data = await res.json();
        if (data.url) window.open(data.url, "_blank");
    }

    function remove(id: string) {
        if (!confirm("Ștergi acest document?")) return;
        startTransition(async () => {
            await deleteDocument(id);
            setDocuments((prev) => prev.filter((d) => d.id !== id));
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center justify-end">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                    <option>Insurance</option>
                    <option>MOT</option>
                    <option>Warranty</option>
                    <option>Other</option>
                </select>
                <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Încarcă document
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Titlu</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Categorie</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Adăugat</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {documents.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-16 text-center text-faint italic">Niciun document încărcat pentru acest vehicul.</td></tr>
                            ) : (
                                documents.map((d) => (
                                    <tr key={d.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4 text-sm text-foreground">{d.title}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{d.category}</td>
                                        <td className="px-6 py-4 text-sm text-muted">{format(new Date(d.createdAt), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => viewDocument(d.id)} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5">
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => remove(d.id)} disabled={isPending} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
