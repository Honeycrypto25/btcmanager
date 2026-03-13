"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Wallet,
    History,
    Settings,
    Lock,
    Bitcoin,
    LogOut,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    LineChart,
    PanelLeftClose,
    Sparkles,
    X,
    BriefcaseBusiness,
    Orbit
} from 'lucide-react';
import { cn } from '@/components/ui/core';
import { signOut } from 'next-auth/react';

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Wallets', href: '/wallets', icon: Wallet },
    { name: 'History', href: '/history', icon: History },
    { name: 'ROI', href: '/roi', icon: TrendingUp },
    { name: 'Wealth Brief', href: '/brief', icon: BriefcaseBusiness },
    { name: 'Analytics', href: '/analytics', icon: LineChart },
    { name: 'Cycles', href: '/cycle', icon: TrendingDown },
    { name: 'Cycle Atlas', href: '/cycle-atlas', icon: Orbit },
    { name: 'Admin', href: '/admin', icon: Lock },
];

interface SidebarProps {
    isOpen: boolean;
    toggle: () => void;
}

export const Sidebar = ({ isOpen, toggle }: SidebarProps) => {
    const pathname = usePathname();

    return (
        <>
            <div
                className={cn(
                    "fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition duration-300 lg:hidden",
                    isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                )}
                onClick={toggle}
            />

            <aside className={cn(
                "fixed left-0 top-0 z-50 flex h-screen w-[18.5rem] flex-col border-r border-white/8 bg-[rgba(10,10,9,0.92)] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-transform duration-300 lg:w-[20rem] lg:translate-x-0 lg:p-5",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between gap-3 rounded-[1.75rem] border border-primary/10 bg-white/[0.03] p-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_10px_30px_rgba(214,169,95,0.14)]">
                                <Bitcoin className="h-6 w-6" />
                            </div>
                            <div>
                                <h1 className="font-display text-3xl leading-none text-white">BTC Manager</h1>
                                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-stone-400">Luxury Ops</p>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-stone-300 transition hover:bg-white/10 hover:text-white lg:hidden"
                            onClick={toggle}
                            aria-label="Close navigation"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="glass rounded-[1.75rem] p-4">
                        <div className="mb-3 flex items-center gap-2 text-primary">
                            <Sparkles className="h-4 w-4" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-primary">Treasury Pulse</p>
                        </div>
                        <p className="font-display text-2xl text-white">Precision tracking for high-conviction BTC accumulation.</p>
                        <p className="mt-2 text-sm leading-6 text-stone-400">Designed for private operators who want calm surfaces, clearer data and faster mobile review.</p>
                    </div>

                    <nav className="space-y-2">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => {
                                        if (window.innerWidth < 1024) {
                                            toggle();
                                        }
                                    }}
                                    className={cn(
                                        'group flex items-center justify-between rounded-[1.35rem] border px-4 py-3.5 transition-all duration-200',
                                        isActive
                                            ? 'border-primary/25 bg-[linear-gradient(135deg,rgba(214,169,95,0.16),rgba(255,255,255,0.03))] text-white shadow-[0_16px_40px_rgba(214,169,95,0.08)]'
                                            : 'border-transparent text-stone-400 hover:border-white/8 hover:bg-white/[0.04] hover:text-white'
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className={cn(
                                            "flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-200",
                                            isActive
                                                ? "border-primary/25 bg-primary/10 text-primary"
                                                : "border-white/6 bg-white/[0.03] text-stone-500 group-hover:border-primary/15 group-hover:text-primary"
                                        )}>
                                            <item.icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="block truncate text-sm font-semibold">{item.name}</span>
                                            <span className="block truncate text-[10px] uppercase tracking-[0.32em] text-stone-500">{item.href === '/' ? 'Command center' : 'Portfolio view'}</span>
                                        </div>
                                    </div>
                                    <ChevronRight className={cn("h-4 w-4 shrink-0 transition", isActive ? "text-primary" : "text-stone-600 group-hover:text-white")} />
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div className="shrink-0 space-y-4 pt-4">
                    <div className="glass rounded-[1.75rem] p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-stone-500">System Status</p>
                            <button
                                type="button"
                                onClick={toggle}
                                className="hidden h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-stone-400 transition hover:bg-white/10 hover:text-white lg:flex"
                                aria-label="Collapse navigation"
                            >
                                <PanelLeftClose className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse" />
                            <span className="text-sm font-medium text-white">Network healthy</span>
                        </div>
                        <p className="mt-2 text-sm text-stone-400">Wallet sync and pricing services are available for quick portfolio checks.</p>
                    </div>

                    <button
                        onClick={() => signOut()}
                        className="flex w-full items-center justify-center gap-3 rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-stone-300 transition hover:border-red-400/25 hover:bg-red-500/8 hover:text-red-200"
                    >
                        <LogOut className="h-5 w-5" />
                        <span>Log Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
};
