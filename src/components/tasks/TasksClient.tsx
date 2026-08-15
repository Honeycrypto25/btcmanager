"use client";

import React, { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { Card, cn } from "@/components/ui/core";
import { CheckCircle2, Circle, Clock, ListChecks, History } from "lucide-react";
import { setDevTaskStatus } from "@/app/actions/dev-tasks";

type Status = "PLANNED" | "IN_PROGRESS" | "DONE";

interface TaskRow {
    id: string;
    phase: string;
    section: string;
    title: string;
    description: string | null;
    status: Status;
    completedAt: string | null;
}

const PHASE_ORDER = ["Phase 1", "Phase 2", "Phase 3", "Phase 4", "Phase 5", "Phase 6", "Later"];

function statusIcon(status: Status) {
    if (status === "DONE") return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (status === "IN_PROGRESS") return <Clock className="w-4 h-4 text-primary" />;
    return <Circle className="w-4 h-4 text-faint" />;
}

export function TasksClient({ initialTasks }: { initialTasks: TaskRow[] }) {
    const [tasks, setTasks] = useState(initialTasks);
    const [view, setView] = useState<"roadmap" | "history">("roadmap");
    const [, startTransition] = useTransition();

    const grouped = useMemo(() => {
        const byPhase = new Map<string, TaskRow[]>();
        for (const t of tasks) {
            const list = byPhase.get(t.phase) ?? [];
            list.push(t);
            byPhase.set(t.phase, list);
        }
        return PHASE_ORDER.filter((p) => byPhase.has(p)).map((phase) => ({ phase, items: byPhase.get(phase)! }));
    }, [tasks]);

    const history = useMemo(
        () =>
            tasks
                .filter((t) => t.status === "DONE" && t.completedAt)
                .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()),
        [tasks]
    );

    const totalDone = tasks.filter((t) => t.status === "DONE").length;
    const totalCount = tasks.length;
    const progressPct = totalCount > 0 ? Math.round((totalDone / totalCount) * 100) : 0;

    function cycleStatus(task: TaskRow) {
        const next: Status = task.status === "PLANNED" ? "IN_PROGRESS" : task.status === "IN_PROGRESS" ? "DONE" : "PLANNED";
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next, completedAt: next === "DONE" ? new Date().toISOString() : null } : t)));
        startTransition(async () => {
            await setDevTaskStatus(task.id, next);
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Dev <span className="gradient-text">Tasks</span>
                    </h1>
                    <p className="text-muted text-sm">
                        Roadmap-ul de dezvoltare al platformei — {totalDone}/{totalCount} finalizate ({progressPct}%).
                    </p>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-border bg-glass p-1">
                    <button
                        onClick={() => setView("roadmap")}
                        className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5", view === "roadmap" ? "bg-primary text-black" : "text-muted hover:text-foreground")}
                    >
                        <ListChecks className="w-3.5 h-3.5" />
                        Roadmap
                    </button>
                    <button
                        onClick={() => setView("history")}
                        className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5", view === "history" ? "bg-primary text-black" : "text-muted hover:text-foreground")}
                    >
                        <History className="w-3.5 h-3.5" />
                        Istoric
                    </button>
                </div>
            </div>

            <Card className="p-4">
                <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
            </Card>

            {view === "roadmap" ? (
                <div className="space-y-6">
                    {grouped.map(({ phase, items }) => (
                        <Card key={phase} className="p-5 sm:p-6">
                            <h3 className="font-display text-lg font-medium text-foreground mb-4">{phase}</h3>
                            <div className="space-y-1">
                                {items.map((task) => (
                                    <button
                                        key={task.id}
                                        onClick={() => cycleStatus(task)}
                                        className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors group"
                                    >
                                        <span className="mt-0.5 shrink-0">{statusIcon(task.status)}</span>
                                        <span className="flex-1">
                                            <span className={cn("text-sm block", task.status === "DONE" ? "text-muted line-through" : "text-foreground")}>
                                                {task.title}
                                            </span>
                                            <span className="text-[10px] text-faint uppercase tracking-wider">{task.section}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card className="overflow-hidden p-0 border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-white/[0.02]">
                                    <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Data</th>
                                    <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Fază</th>
                                    <th className="px-6 py-4 text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Funcționalitate</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-16 text-center text-faint italic">
                                            Niciun element finalizat încă.
                                        </td>
                                    </tr>
                                ) : (
                                    history.map((t) => (
                                        <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                                            <td className="px-6 py-4 text-sm text-muted">{format(new Date(t.completedAt!), "dd MMM yyyy")}</td>
                                            <td className="px-6 py-4 text-sm text-muted">{t.phase}</td>
                                            <td className="px-6 py-4 text-sm text-foreground">{t.title}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
