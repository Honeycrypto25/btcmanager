"use client";

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '@/components/ui/core';
import { Bitcoin, Menu } from 'lucide-react';

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />

            <main className={cn(
                "min-h-screen transition-all duration-200 lg:ml-[17rem]"
            )}>
                <div className="sticky top-0 z-30 border-b border-border bg-background px-4 py-3 sm:px-6 lg:hidden">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                                <Bitcoin className="h-4 w-4" />
                            </div>
                            <p className="font-display text-base font-medium leading-none text-foreground">BTC Manager</p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsSidebarOpen(true)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-white/5"
                            aria-label="Open navigation"
                        >
                            <Menu className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
                    {children}
                </div>
            </main>
        </div>
    );
};
