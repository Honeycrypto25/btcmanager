"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, Button, cn } from "@/components/ui/core";
import { Upload, Landmark, History, Check, X, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
    previewBankCsv,
    importBankCsv,
    createBankAccount,
    confirmMatch,
    rejectMatch,
    rerunMatching,
    getReceiptSummaries,
    type ImportBankCsvInput,
} from "@/app/actions/bank";
import type { AmountMode } from "@/lib/bank/csv";

interface Account {
    id: string;
    name: string;
    currency: string | null;
}

interface TransactionRow {
    id: string;
    transactionDate: string;
    description: string;
    amount: number;
    debitCredit: string;
    balance: number | null;
    receiptId: string | null;
    matchConfidence: number | null;
    matchStatus: string;
    taxYear: string;
}

interface BatchRow {
    id: string;
    filename: string;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    createdAt: string;
}

function formatMoney(amount: number, currency = "GBP"): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function matchBadge(status: string) {
    const styles: Record<string, string> = {
        matched: "bg-green-500/10 text-green-300 border-green-400/30",
        possible_match: "bg-amber-500/10 text-amber-300 border-amber-400/30",
        unmatched: "bg-white/[0.04] text-muted border-border",
    };
    const labels: Record<string, string> = {
        matched: "Potrivit",
        possible_match: "Posibilă potrivire",
        unmatched: "Nepotrivit",
    };
    return (
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider", styles[status] || styles.unmatched)}>
            {labels[status] || status}
        </span>
    );
}

type Tab = "import" | "transactions" | "history";

export function BankClient({ accounts, transactions, batches }: { accounts: Account[]; transactions: TransactionRow[]; batches: BatchRow[] }) {
    const [tab, setTab] = useState<Tab>("transactions");

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        <span className="gradient-text">Bancă</span>
                    </h1>
                    <p className="text-muted text-sm">Import extras CSV și potrivire cu chitanțele.</p>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1">
                    {([
                        ["import", "Import", Upload],
                        ["transactions", "Tranzacții", Landmark],
                        ["history", "Istoric", History],
                    ] as const).map(([key, label, Icon]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                                tab === key ? "bg-primary text-black" : "text-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === "import" && <ImportTab accounts={accounts} />}
            {tab === "transactions" && <TransactionsTab transactions={transactions} />}
            {tab === "history" && <HistoryTab batches={batches} />}
        </div>
    );
}

// --- Import tab ---

function ImportTab({ accounts }: { accounts: Account[] }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [csvText, setCsvText] = useState<string | null>(null);
    const [filename, setFilename] = useState("");
    const [headers, setHeaders] = useState<string[]>([]);
    const [sampleRows, setSampleRows] = useState<string[][]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [amountMode, setAmountMode] = useState<AmountMode>("single");
    const [dateColumn, setDateColumn] = useState("");
    const [descriptionColumn, setDescriptionColumn] = useState("");
    const [amountColumn, setAmountColumn] = useState("");
    const [debitColumn, setDebitColumn] = useState("");
    const [creditColumn, setCreditColumn] = useState("");
    const [balanceColumn, setBalanceColumn] = useState("");
    const [accountId, setAccountId] = useState<string>(accounts[0]?.id || "");
    const [newAccountName, setNewAccountName] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ importedCount: number; duplicateCount: number; matchedCount: number; rowCount: number } | null>(null);

    function pickFile() {
        fileInputRef.current?.click();
    }

    function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setFilename(file.name);
        setError(null);
        setResult(null);
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || "");
            setCsvText(text);
            startTransition(async () => {
                try {
                    const preview = await previewBankCsv(text);
                    setHeaders(preview.headers);
                    setSampleRows(preview.sampleRows);
                    setTotalRows(preview.totalRows);
                    // Best-effort guesses so the user usually just confirms
                    const guess = (candidates: string[]) => preview.headers.find((h) => candidates.some((c) => h.toLowerCase().includes(c))) || "";
                    setDateColumn(guess(["date"]));
                    setDescriptionColumn(guess(["description", "narrative", "details", "memo"]));
                    setAmountColumn(guess(["amount"]));
                    setDebitColumn(guess(["debit", "paid out", "withdrawal"]));
                    setCreditColumn(guess(["credit", "paid in", "deposit"]));
                    setBalanceColumn(guess(["balance"]));
                } catch (err: any) {
                    setError(err.message || "Nu am putut citi fișierul CSV.");
                }
            });
        };
        reader.readAsText(file);
        e.target.value = "";
    }

    async function doImport() {
        if (!csvText || !dateColumn || !descriptionColumn) {
            setError("Selectează cel puțin coloanele Dată și Descriere.");
            return;
        }
        if (amountMode === "single" && !amountColumn) {
            setError("Selectează coloana de sumă.");
            return;
        }
        if (amountMode === "debit_credit" && !debitColumn && !creditColumn) {
            setError("Selectează cel puțin o coloană Debit sau Credit.");
            return;
        }

        setError(null);
        startTransition(async () => {
            try {
                let finalAccountId = accountId;
                if (!finalAccountId && newAccountName.trim()) {
                    const created = await createBankAccount(newAccountName.trim());
                    finalAccountId = created.id;
                }

                const input: ImportBankCsvInput = {
                    filename,
                    csvText: csvText!,
                    bankAccountId: finalAccountId || undefined,
                    mapping: {
                        dateColumn,
                        descriptionColumn,
                        amountMode,
                        amountColumn: amountMode === "single" ? amountColumn : undefined,
                        debitColumn: amountMode === "debit_credit" ? debitColumn : undefined,
                        creditColumn: amountMode === "debit_credit" ? creditColumn : undefined,
                        balanceColumn: balanceColumn || undefined,
                    },
                };
                const res = await importBankCsv(input);
                setResult(res);
                setCsvText(null);
                setHeaders([]);
            } catch (err: any) {
                setError(err.message || "Import eșuat.");
            }
        });
    }

    return (
        <div className="space-y-6">
            <Card className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <p className="font-medium text-foreground">Extras bancar (CSV)</p>
                        <p className="text-xs text-muted mt-0.5">Funcționează cu extrase de la orice bancă — alegi tu ce înseamnă fiecare coloană.</p>
                    </div>
                    <Button variant="primary" onClick={pickFile} disabled={isPending}>
                        {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        Alege fișier CSV
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileSelected} />
                </div>
            </Card>

            {error && (
                <Card className="p-4 border-red-400/30 bg-red-500/5">
                    <p className="text-sm text-red-300">{error}</p>
                </Card>
            )}

            {result && (
                <Card className="p-4 border-green-400/30 bg-green-500/5">
                    <p className="text-sm text-green-300">
                        Import finalizat: {result.importedCount} tranzacții noi, {result.duplicateCount} duplicate ignorate
                        {result.matchedCount > 0 ? `, ${result.matchedCount} potrivite cu chitanțe` : ""} (din {result.rowCount} rânduri).
                    </p>
                </Card>
            )}

            {headers.length > 0 && (
                <Card className="p-5 sm:p-6 space-y-5">
                    <div>
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">Previzualizare ({totalRows} rânduri)</h3>
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="bg-white/[0.02]">
                                        {headers.map((h) => (
                                            <th key={h} className="px-3 py-2 text-muted font-medium whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {sampleRows.map((row, i) => (
                                        <tr key={i}>
                                            {row.map((cell, j) => (
                                                <td key={j} className="px-3 py-2 text-foreground whitespace-nowrap">{cell}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ColumnSelect label="Coloană Dată" value={dateColumn} onChange={setDateColumn} headers={headers} />
                        <ColumnSelect label="Coloană Descriere" value={descriptionColumn} onChange={setDescriptionColumn} headers={headers} />

                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs text-muted">Format sumă</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAmountMode("single")}
                                    className={cn("flex-1 rounded-xl border px-3 py-2.5 text-sm text-left", amountMode === "single" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted")}
                                >
                                    O singură coloană (sumă cu semn: negativ = cheltuială)
                                </button>
                                <button
                                    onClick={() => setAmountMode("debit_credit")}
                                    className={cn("flex-1 rounded-xl border px-3 py-2.5 text-sm text-left", amountMode === "debit_credit" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted")}
                                >
                                    Două coloane separate (Debit / Credit)
                                </button>
                            </div>
                        </div>

                        {amountMode === "single" ? (
                            <ColumnSelect label="Coloană Sumă" value={amountColumn} onChange={setAmountColumn} headers={headers} />
                        ) : (
                            <>
                                <ColumnSelect label="Coloană Debit (cheltuieli)" value={debitColumn} onChange={setDebitColumn} headers={headers} allowEmpty />
                                <ColumnSelect label="Coloană Credit (încasări)" value={creditColumn} onChange={setCreditColumn} headers={headers} allowEmpty />
                            </>
                        )}
                        <ColumnSelect label="Coloană Sold (opțional)" value={balanceColumn} onChange={setBalanceColumn} headers={headers} allowEmpty />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-muted">Cont bancar (opțional)</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <select
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                className="flex-1 bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary"
                            >
                                <option value="" className="bg-surface">— Fără cont specific —</option>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id} className="bg-surface">{a.name}</option>
                                ))}
                            </select>
                            <input
                                placeholder="sau nume cont nou..."
                                value={newAccountName}
                                onChange={(e) => setNewAccountName(e.target.value)}
                                className="flex-1 bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                    </div>

                    <Button variant="primary" onClick={doImport} disabled={isPending}>
                        {isPending ? "Se importă..." : `Importă ${totalRows} tranzacții`}
                    </Button>
                </Card>
            )}
        </div>
    );
}

function ColumnSelect({ label, value, onChange, headers, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; headers: string[]; allowEmpty?: boolean }) {
    return (
        <div className="space-y-1">
            <label className="text-xs text-muted">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-white/[0.04] border border-border rounded-xl p-3 text-foreground text-sm focus:outline-none focus:border-primary"
            >
                {allowEmpty && <option value="" className="bg-surface">— Niciuna —</option>}
                {headers.map((h) => (
                    <option key={h} value={h} className="bg-surface">{h}</option>
                ))}
            </select>
        </div>
    );
}

// --- Transactions tab ---

function TransactionsTab({ transactions }: { transactions: TransactionRow[] }) {
    const [rows, setRows] = useState(transactions);
    const [filter, setFilter] = useState<string | null>(null);
    const [receiptInfo, setReceiptInfo] = useState<Record<string, { merchant: string | null; amount: number | null; receiptDate: string | null }>>({});
    const [isPending, startTransition] = useTransition();

    const receiptIds = useMemo(() => Array.from(new Set(rows.map((r) => r.receiptId).filter(Boolean))) as string[], [rows]);

    useEffect(() => {
        if (receiptIds.length === 0) return;
        getReceiptSummaries(receiptIds).then((summaries) => {
            const map: typeof receiptInfo = {};
            for (const s of summaries) {
                map[s.id] = { merchant: s.merchant, amount: s.amount, receiptDate: s.receiptDate ? new Date(s.receiptDate).toISOString() : null };
            }
            setReceiptInfo(map);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [receiptIds.join(",")]);

    const filtered = filter ? rows.filter((r) => r.matchStatus === filter) : rows;

    function confirm(txId: string, receiptId: string) {
        startTransition(async () => {
            await confirmMatch(txId, receiptId);
            setRows((prev) => prev.map((r) => (r.id === txId ? { ...r, matchStatus: "matched", matchConfidence: 1 } : r)));
        });
    }

    function reject(txId: string) {
        startTransition(async () => {
            await rejectMatch(txId);
            setRows((prev) => prev.map((r) => (r.id === txId ? { ...r, matchStatus: "unmatched", receiptId: null, matchConfidence: null } : r)));
        });
    }

    function runRematch() {
        startTransition(async () => {
            await rerunMatching();
            window.location.reload();
        });
    }

    const counts = {
        matched: rows.filter((r) => r.matchStatus === "matched").length,
        possible_match: rows.filter((r) => r.matchStatus === "possible_match").length,
        unmatched: rows.filter((r) => r.matchStatus === "unmatched").length,
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                    {(["matched", "possible_match", "unmatched"] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilter(s === filter ? null : s)}
                            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border", filter === s ? "bg-primary text-black border-primary" : "bg-glass border-border text-muted hover:text-foreground")}
                        >
                            {s === "matched" ? "Potrivite" : s === "possible_match" ? "Posibile" : "Nepotrivite"} ({counts[s]})
                        </button>
                    ))}
                </div>
                <Button variant="outline" size="sm" onClick={runRematch} disabled={isPending}>
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Rulează matching
                </Button>
            </div>

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Descriere</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-faint italic">
                                        <Landmark className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Nicio tranzacție. Importă un CSV din tab-ul &bdquo;Import&rdquo;.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-4 text-sm text-foreground whitespace-nowrap">{format(new Date(tx.transactionDate), "dd MMM yyyy")}</td>
                                        <td className="px-6 py-4 text-sm text-foreground max-w-xs truncate">{tx.description}</td>
                                        <td className={cn("px-6 py-4 text-sm font-medium whitespace-nowrap", tx.debitCredit === "DEBIT" ? "text-red-400" : "text-green-400")}>
                                            {tx.debitCredit === "DEBIT" ? "-" : "+"}{formatMoney(tx.amount)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1.5">
                                                {matchBadge(tx.matchStatus)}
                                                {tx.matchStatus === "possible_match" && tx.receiptId && receiptInfo[tx.receiptId] && (
                                                    <p className="text-[11px] text-muted">
                                                        Sugestie: {receiptInfo[tx.receiptId].merchant || "chitanță"} · {receiptInfo[tx.receiptId].amount !== null ? formatMoney(receiptInfo[tx.receiptId].amount!) : ""}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {tx.matchStatus === "possible_match" && tx.receiptId && (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => confirm(tx.id, tx.receiptId!)}
                                                        className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10"
                                                        title="Confirmă potrivirea"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => reject(tx.id)}
                                                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
                                                        title="Respinge"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                            {tx.matchStatus === "matched" && (
                                                <button onClick={() => reject(tx.id)} className="text-[11px] text-muted hover:text-red-400">
                                                    Anulează potrivirea
                                                </button>
                                            )}
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

// --- History tab ---

function HistoryTab({ batches }: { batches: BatchRow[] }) {
    return (
        <Card className="overflow-hidden p-0 border-border">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border bg-white/[0.02]">
                            <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data import</th>
                            <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Fișier</th>
                            <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Rânduri</th>
                            <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Importate</th>
                            <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Duplicate</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {batches.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-16 text-center text-faint italic">
                                    <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                    Niciun import încă.
                                </td>
                            </tr>
                        ) : (
                            batches.map((b) => (
                                <tr key={b.id} className="hover:bg-white/[0.01] transition-colors">
                                    <td className="px-6 py-4 text-sm text-foreground">{format(new Date(b.createdAt), "dd MMM yyyy, HH:mm")}</td>
                                    <td className="px-6 py-4 text-sm text-muted">{b.filename}</td>
                                    <td className="px-6 py-4 text-sm text-foreground">{b.rowCount}</td>
                                    <td className="px-6 py-4 text-sm text-green-400">{b.importedCount}</td>
                                    <td className="px-6 py-4 text-sm text-muted">{b.duplicateCount}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
