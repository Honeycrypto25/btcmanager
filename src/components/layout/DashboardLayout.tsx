"use client";

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '@/components/ui/core';
import { Bitcoin, Menu } from 'lucide-react';

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="relative min-h-screen bg-transparent text-white">
            <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />

            <main className={cn(
                "min-h-screen transition-all duration-300 lg:ml-[20rem]"
            )}>
                <div className="sticky top-0 z-30 border-b border-white/6 bg-[rgba(9,9,8,0.72)] px-4 py-4 backdrop-blur-xl sm:px-6 lg:hidden">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_10px_30px_rgba(214,169,95,0.12)]">
                                <Bitcoin className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-display text-2xl leading-none text-white">BTC Manager</p>
                                <p className="text-[10px] uppercase tracking-[0.35em] text-stone-400">Private Wealth</p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsSidebarOpen(true)}
                            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                            aria-label="Open navigation"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
                    {children}
                </div>
            </main>

            <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[26rem] bg-[radial-gradient(circle_at_top,rgba(214,169,95,0.16),transparent_54%)]" />
            <div className="pointer-events-none fixed bottom-[-8rem] right-[-2rem] -z-10 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(142,197,164,0.14),transparent_64%)] blur-2xl" />
        </div>
    );
};
