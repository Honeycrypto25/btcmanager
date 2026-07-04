"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Wallet,
    History,
    Lock,
    Bitcoin,
    LogOut,
    TrendingUp,
    TrendingDown,
    LineChart,
    X
} from 'lucide-react';
import { cn } from '@/components/ui/core';
import { signOut } from 'next-auth/react';

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Wallets', href: '/wallets', icon: Wallet },
    { name: 'History', href: '/history', icon: History },
    { name: 'ROI', href: '/roi', icon: TrendingUp },
    { name: 'Analytics', href: '/analytics', icon: LineChart },
    { name: 'Cycles', href: '/cycle', icon: TrendingDown },
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
                    "fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 lg:hidden",
                    isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                )}
                onClick={toggle}
            />

            <aside className={cn(
                "fixed left-0 top-0 z-50 flex h-screen w-[17rem] flex-col border-r border-border bg-background p-4 transition-transform duration-200 lg:translate-x-0 lg:p-5",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                    <div className="mb-6 flex items-center justify-between gap-3 px-1">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                                <Bitcoin className="h-5 w-5" />
                            </div>
                            <p className="font-display text-lg font-medium leading-none text-foreground">BTC Manager</p>
                        </div>

                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-foreground lg:hidden"
                            onClick={toggle}
                            aria-label="Close navigation"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <nav className="space-y-0.5">
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
                                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
                                        isActive
                                            ? 'bg-white/[0.06] text-foreground'
                                            : 'text-muted hover:bg-white/[0.03] hover:text-foreground'
                                    )}
                                >
                                    <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-faint group-hover:text-muted")} />
                                    <span className="truncate font-medium">{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div className="shrink-0 pt-4 hairline-top">
                    <button
                        onClick={() => signOut()}
                        className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-red-500/5 hover:text-red-300"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="font-medium">Log out</span>
                    </button>
                </div>
            </aside>
        </>
    );
};
