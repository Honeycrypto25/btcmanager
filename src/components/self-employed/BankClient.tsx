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
    convertTransactionToIncome,
    convertTransactionToExpense,
    ignoreTransaction,
    undoTransactionConversion,
    bulkIgnoreTransactions,
    bulkAssignAccount,
    type ImportBankCsvInput,
} from "@/app/actions/bank";
import type { AmountMode } from "@/lib/bank/csv";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

interface Account {
    id: string;
    name: string;
    currency: string | null;
}

interface TransactionRow {
    id: string;
    accountId: string | null;
    transactionDate: string;
    description: string;
    amount: number;
    debitCredit: string;
    balance: number | null;
    receiptId: string | null;
    matchConfidence: number | null;
    matchStatus: string;
    taxYear: string;
    convertedType: string | null;
    convertedRecordId: string | null;
}

interface MatchableReceipt {
    id: string;
    merchant: string | null;
    amount: number | null;
    receiptDate: string | null;
    category: string | null;
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

export function BankClient({ accounts, transactions, batches, matchableReceipts }: { accounts: Account[]; transactions: TransactionRow[]; batches: BatchRow[]; matchableReceipts: MatchableReceipt[] }) {
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
            {tab === "transactions" && <TransactionsTab transactions={transactions} accounts={accounts} matchableReceipts={matchableReceipts} />}
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

function TransactionsTab({ transactions, accounts, matchableReceipts }: { transactions: TransactionRow[]; accounts: Account[]; matchableReceipts: MatchableReceipt[] }) {
    const [rows, setRows] = useState(transactions);
    const [filter, setFilter] = useState<string | null>(null);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [search, setSearch] = useState("");
    const [accountFilter, setAccountFilter] = useState("");
    const [receiptInfo, setReceiptInfo] = useState<Record<string, { merchant: string | null; amount: number | null; receiptDate: string | null }>>({});
    const [isPending, startTransition] = useTransition();
    const [expandedTx, setExpandedTx] = useState<string | null>(null);
    const [convertError, setConvertError] = useState<string | null>(null);
    const [matchPickerTxId, setMatchPickerTxId] = useState<string | null>(null);
    const [matchSearch, setMatchSearch] = useState("");
    const [linkedReceiptIds, setLinkedReceiptIds] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkAccountId, setBulkAccountId] = useState("");

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

    const accountNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const a of accounts) map.set(a.id, a.name);
        return map;
    }, [accounts]);

    const filtered = useMemo(() => {
        let list = filter ? rows.filter((r) => r.matchStatus === filter) : rows;
        if (dateFrom) list = list.filter((r) => r.transactionDate.slice(0, 10) >= dateFrom);
        if (dateTo) list = list.filter((r) => r.transactionDate.slice(0, 10) <= dateTo);
        if (accountFilter) list = list.filter((r) => r.accountId === accountFilter);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((r) => r.description.toLowerCase().includes(q));
        }
        return list;
    }, [rows, filter, dateFrom, dateTo, accountFilter, search]);

    const hasActiveFilters = !!(filter || dateFrom || dateTo || accountFilter || search.trim());
    function clearFilters() {
        setFilter(null);
        setDateFrom("");
        setDateTo("");
        setAccountFilter("");
        setSearch("");
    }

    const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

    function toggleSelect(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleSelectAllFiltered() {
        setSelected((prev) => {
            if (allFilteredSelected) {
                const next = new Set(prev);
                for (const id of filteredIds) next.delete(id);
                return next;
            }
            return new Set([...prev, ...filteredIds]);
        });
    }

    function clearSelection() {
        setSelected(new Set());
    }

    function confirm(txId: string, receiptId: string) {
        startTransition(async () => {
            await confirmMatch(txId, receiptId);
            setRows((prev) => prev.map((r) => (r.id === txId ? { ...r, receiptId, matchStatus: "matched", matchConfidence: 1 } : r)));
            setLinkedReceiptIds((prev) => new Set(prev).add(receiptId));
            setMatchPickerTxId(null);
            setMatchSearch("");
        });
    }

    const matchCandidates = useMemo(() => {
        const q = matchSearch.trim().toLowerCase();
        return matchableReceipts
            .filter((r) => !linkedReceiptIds.has(r.id))
            .filter((r) => !q || (r.merchant || "").toLowerCase().includes(q))
            .slice(0, 20);
    }, [matchableReceipts, matchSearch, linkedReceiptIds]);

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

    function doConvertIncome(tx: TransactionRow, description: string, client: string) {
        setConvertError(null);
        startTransition(async () => {
            try {
                const income = await convertTransactionToIncome(tx.id, { description, client: client || undefined });
                setRows((prev) => prev.map((r) => (r.id === tx.id ? { ...r, convertedType: "income", convertedRecordId: income.id } : r)));
                setExpandedTx(null);
            } catch (err: any) {
                setConvertError(err.message || "Conversie eșuată.");
            }
        });
    }

    function doConvertExpense(tx: TransactionRow, merchant: string, category: string) {
        setConvertError(null);
        startTransition(async () => {
            try {
                const expense = await convertTransactionToExpense(tx.id, { merchant, category });
                setRows((prev) => prev.map((r) => (r.id === tx.id ? { ...r, convertedType: "expense", convertedRecordId: expense.id } : r)));
                setExpandedTx(null);
            } catch (err: any) {
                setConvertError(err.message || "Conversie eșuată.");
            }
        });
    }

    function doIgnore(tx: TransactionRow) {
        setConvertError(null);
        startTransition(async () => {
            try {
                await ignoreTransaction(tx.id);
                setRows((prev) => prev.map((r) => (r.id === tx.id ? { ...r, convertedType: "ignored", convertedRecordId: null } : r)));
            } catch (err: any) {
                setConvertError(err.message || "Acțiune eșuată.");
            }
        });
    }

    function doUndoConversion(tx: TransactionRow) {
        setConvertError(null);
        startTransition(async () => {
            try {
                await undoTransactionConversion(tx.id);
                setRows((prev) => prev.map((r) => (r.id === tx.id ? { ...r, convertedType: null, convertedRecordId: null } : r)));
            } catch (err: any) {
                setConvertError(err.message || "Acțiune eșuată.");
            }
        });
    }

    function doBulkIgnore() {
        if (selected.size === 0) return;
        setConvertError(null);
        const ids = Array.from(selected);
        startTransition(async () => {
            try {
                await bulkIgnoreTransactions(ids);
                const idSet = new Set(ids);
                setRows((prev) => prev.map((r) => (idSet.has(r.id) && !r.convertedType ? { ...r, convertedType: "ignored", convertedRecordId: null } : r)));
                clearSelection();
            } catch (err: any) {
                setConvertError(err.message || "Acțiune eșuată.");
            }
        });
    }

    function doBulkAssignAccount() {
        if (selected.size === 0 || !bulkAccountId) return;
        setConvertError(null);
        const ids = Array.from(selected);
        const accId = bulkAccountId;
        startTransition(async () => {
            try {
                await bulkAssignAccount(ids, accId);
                const idSet = new Set(ids);
                setRows((prev) => prev.map((r) => (idSet.has(r.id) ? { ...r, accountId: accId } : r)));
                clearSelection();
                setBulkAccountId("");
            } catch (err: any) {
                setConvertError(err.message || "Acțiune eșuată.");
            }
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

            <Card className="p-3 sm:p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">De la</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Până la</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                    </div>
                    {accounts.length > 0 && (
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted uppercase tracking-wider">Cont</label>
                            <select
                                value={accountFilter}
                                onChange={(e) => setAccountFilter(e.target.value)}
                                className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                            >
                                <option value="" className="bg-surface">Toate conturile</option>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id} className="bg-surface">{a.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex-1 min-w-[160px] space-y-1">
                        <label className="text-[11px] text-muted uppercase tracking-wider">Caută descriere</label>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ex. Tesco, Uber..."
                            className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                    </div>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="text-xs text-muted hover:text-red-400 pb-1.5 flex items-center gap-1">
                            <X className="w-3.5 h-3.5" /> Șterge filtrele
                        </button>
                    )}
                    <span className="text-xs text-faint pb-1.5 ml-auto">
                        {filtered.length} din {rows.length} tranzacții
                    </span>
                </div>
            </Card>

            {selected.size > 0 && (
                <Card className="p-3 sm:p-4 border-primary/30 bg-primary/5">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm text-foreground font-medium">{selected.size} selectate</span>
                        {accounts.length > 0 && (
                            <div className="flex items-center gap-2">
                                <select
                                    value={bulkAccountId}
                                    onChange={(e) => setBulkAccountId(e.target.value)}
                                    className="bg-white/[0.04] border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                                >
                                    <option value="" className="bg-surface">Alege cont...</option>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id} className="bg-surface">{a.name}</option>
                                    ))}
                                </select>
                                <Button variant="outline" size="sm" onClick={doBulkAssignAccount} disabled={isPending || !bulkAccountId}>
                                    Atribuie cont
                                </Button>
                            </div>
                        )}
                        <Button variant="outline" size="sm" onClick={doBulkIgnore} disabled={isPending}>
                            Ignoră selectate
                        </Button>
                        <button onClick={clearSelection} className="text-xs text-muted hover:text-foreground ml-auto flex items-center gap-1">
                            <X className="w-3.5 h-3.5" /> Anulează selecția
                        </button>
                    </div>
                </Card>
            )}

            {convertError && (
                <Card className="p-4 border-red-400/30 bg-red-500/5">
                    <p className="text-sm text-red-300">{convertError}</p>
                </Card>
            )}

            <Card className="overflow-hidden p-0 border-border">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-white/[0.02]">
                                <th className="px-4 py-4 w-10">
                                    <input
                                        type="checkbox"
                                        checked={allFilteredSelected}
                                        onChange={toggleSelectAllFiltered}
                                        aria-label="Selectează toate tranzacțiile filtrate"
                                        className="w-4 h-4 rounded border-border bg-white/[0.04] accent-primary cursor-pointer"
                                    />
                                </th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Cont</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Descriere</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Sumă</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-faint italic">
                                        <Landmark className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                        Nicio tranzacție. Importă un CSV din tab-ul &bdquo;Import&rdquo;.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((tx) => (
                                    <React.Fragment key={tx.id}>
                                        <tr className="hover:bg-white/[0.01] transition-colors">
                                            <td className="px-4 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(tx.id)}
                                                    onChange={() => toggleSelect(tx.id)}
                                                    aria-label="Selectează tranzacția"
                                                    className="w-4 h-4 rounded border-border bg-white/[0.04] accent-primary cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-sm text-foreground whitespace-nowrap">{format(new Date(tx.transactionDate), "dd MMM yyyy")}</td>
                                            <td className="px-6 py-4 text-sm text-muted whitespace-nowrap">{tx.accountId ? accountNameById.get(tx.accountId) || "—" : "—"}</td>
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
                                                <div className="flex flex-col items-end gap-2">
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

                                                    {tx.convertedType ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="inline-flex items-center rounded-full border border-border bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                                                                {tx.convertedType === "income" ? "→ Venit" : tx.convertedType === "expense" ? "→ Cheltuială" : "Ignorată"}
                                                            </span>
                                                            <button onClick={() => doUndoConversion(tx)} className="text-[11px] text-muted hover:text-red-400">
                                                                Anulează
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            {tx.debitCredit === "CREDIT" && (
                                                                <button
                                                                    onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
                                                                    className="text-[11px] text-primary hover:underline"
                                                                >
                                                                    Marchează venit
                                                                </button>
                                                            )}
                                                            {tx.debitCredit === "DEBIT" && (
                                                                <button
                                                                    onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
                                                                    className="text-[11px] text-primary hover:underline"
                                                                >
                                                                    Marchează cheltuială
                                                                </button>
                                                            )}
                                                            {tx.matchStatus === "unmatched" && (
                                                                <button
                                                                    onClick={() => { setMatchPickerTxId(matchPickerTxId === tx.id ? null : tx.id); setMatchSearch(""); }}
                                                                    className="text-[11px] text-primary hover:underline"
                                                                >
                                                                    Leagă chitanță
                                                                </button>
                                                            )}
                                                            <button onClick={() => doIgnore(tx)} className="text-[11px] text-muted hover:text-foreground">
                                                                Ignoră
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedTx === tx.id && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={7} className="px-6 py-4">
                                                    {tx.debitCredit === "CREDIT" ? (
                                                        <IncomeConversionForm
                                                            tx={tx}
                                                            isPending={isPending}
                                                            onCancel={() => setExpandedTx(null)}
                                                            onSubmit={(description, client) => doConvertIncome(tx, description, client)}
                                                        />
                                                    ) : (
                                                        <ExpenseConversionForm
                                                            tx={tx}
                                                            isPending={isPending}
                                                            onCancel={() => setExpandedTx(null)}
                                                            onSubmit={(merchant, category) => doConvertExpense(tx, merchant, category)}
                                                        />
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                        {matchPickerTxId === tx.id && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={7} className="px-6 py-4">
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-xs text-muted">
                                                                Leagă manual o chitanță de această tranzacție, chiar dacă suma nu se potrivește exact (ex. combustibil + un alt produs cumpărat la aceeași plată).
                                                            </p>
                                                            <button onClick={() => setMatchPickerTxId(null)} className="text-faint hover:text-foreground">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                        <input
                                                            autoFocus
                                                            value={matchSearch}
                                                            onChange={(e) => setMatchSearch(e.target.value)}
                                                            placeholder="Caută după comerciant..."
                                                            className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                                                        />
                                                        <div className="max-h-64 overflow-y-auto divide-y divide-white/5 rounded-lg border border-border">
                                                            {matchCandidates.length === 0 ? (
                                                                <p className="px-3 py-4 text-xs text-faint italic">Nicio chitanță disponibilă pentru legare manuală.</p>
                                                            ) : (
                                                                matchCandidates.map((r) => (
                                                                    <div key={r.id} className="flex items-center justify-between px-3 py-2 hover:bg-white/[0.02]">
                                                                        <div>
                                                                            <p className="text-sm text-foreground">{r.merchant || "Chitanță fără comerciant"}</p>
                                                                            <p className="text-[11px] text-muted">
                                                                                {r.receiptDate ? format(new Date(r.receiptDate), "dd MMM yyyy") : "fără dată"}
                                                                                {r.amount !== null ? ` · ${formatMoney(r.amount)}` : ""}
                                                                                {r.category ? ` · ${r.category}` : ""}
                                                                            </p>
                                                                        </div>
                                                                        <Button variant="outline" size="sm" onClick={() => confirm(tx.id, r.id)} disabled={isPending}>
                                                                            Leagă
                                                                        </Button>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function IncomeConversionForm({
    tx,
    isPending,
    onCancel,
    onSubmit,
}: {
    tx: TransactionRow;
    isPending: boolean;
    onCancel: () => void;
    onSubmit: (description: string, client: string) => void;
}) {
    const [description, setDescription] = useState(tx.description);
    const [client, setClient] = useState("");

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex-1 w-full space-y-1">
                <label className="text-xs text-muted">Descriere</label>
                <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                />
            </div>
            <div className="flex-1 w-full space-y-1">
                <label className="text-xs text-muted">Client (opțional)</label>
                <input
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                />
            </div>
            <div className="flex gap-2 shrink-0">
                <Button variant="primary" size="sm" onClick={() => onSubmit(description, client)} disabled={isPending || !description.trim()}>
                    Confirmă venit
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel}>
                    Renunță
                </Button>
            </div>
        </div>
    );
}

function ExpenseConversionForm({
    tx,
    isPending,
    onCancel,
    onSubmit,
}: {
    tx: TransactionRow;
    isPending: boolean;
    onCancel: () => void;
    onSubmit: (merchant: string, category: string) => void;
}) {
    const [merchant, setMerchant] = useState(tx.description);
    const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex-1 w-full space-y-1">
                <label className="text-xs text-muted">Comerciant</label>
                <input
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                />
            </div>
            <div className="flex-1 w-full space-y-1">
                <label className="text-xs text-muted">Categorie</label>
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                >
                    {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c} className="bg-surface">
                            {c}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex gap-2 shrink-0">
                <Button variant="primary" size="sm" onClick={() => onSubmit(merchant, category)} disabled={isPending || !merchant.trim()}>
                    Confirmă cheltuială
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel}>
                    Renunță
                </Button>
            </div>
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
