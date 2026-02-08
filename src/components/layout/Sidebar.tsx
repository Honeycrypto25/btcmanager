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
    LineChart
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
        <aside className={cn(
            "fixed left-0 top-0 h-screen bg-[#080808] border-r border-border flex flex-col justify-between z-50 transition-all duration-300",
            isOpen ? "w-64 p-6" : "w-20 p-4"
        )}>
            <div>
                <div className={cn("flex items-center mb-10 transition-all duration-300", isOpen ? "gap-3 px-2" : "justify-center px-0 flex-col gap-4")}>
                    <div
                        className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(247,147,26,0.2)] cursor-pointer hover:scale-105 transition-transform"
                        onClick={toggle}
                        title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                    >
                        <Bitcoin className="text-black w-6 h-6" />
                    </div>

                    <div className={cn("transition-all duration-300 overflow-hidden whitespace-nowrap", isOpen ? "w-auto opacity-100" : "w-0 opacity-0 h-0")}>
                        <h1 className="text-lg font-bold tracking-tight">BTC Manager</h1>
                        <p className="text-[10px] text-primary/80 uppercase tracking-widest font-bold">Advanced DCA</p>
                    </div>
                </div>

                <nav className="space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    'group flex items-center rounded-2xl transition-all duration-200',
                                    isOpen ? "px-4 py-3 justify-between" : "justify-center w-12 h-12 mx-auto",
                                    isActive
                                        ? 'bg-glass border border-white/10 text-white'
                                        : 'text-gray-500 hover:text-white hover:bg-glass/50'
                                )}
                                title={!isOpen ? item.name : undefined}
                            >
                                <div className={cn("flex items-center gap-3", !isOpen && "justify-center")}>
                                    <item.icon className={cn('w-5 h-5 transition-transform duration-200 group-hover:scale-110', isActive ? 'text-primary' : '')} />
                                    <span className={cn("text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap", isOpen ? "w-auto opacity-100" : "w-0 opacity-0 hidden")}>{item.name}</span>
                                </div>
                                {isActive && isOpen && <ChevronRight className="w-4 h-4 text-primary" />}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="space-y-4">
                {isOpen && (
                    <div className="glass p-4 rounded-2xl border-white/5 animate-in fade-in zoom-in duration-300">
                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">System Status</p>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                            <span className="text-xs text-white font-medium">Network Syncing</span>
                        </div>
                    </div>
                )}

                <button
                    onClick={() => signOut()}
                    className={cn(
                        "w-full flex items-center text-gray-500 hover:text-red-400 hover:bg-red-500/5 rounded-2xl transition-all duration-200",
                        isOpen ? "gap-3 px-4 py-3" : "justify-center w-12 h-12 mx-auto"
                    )}
                    title={!isOpen ? "Log Out" : undefined}
                >
                    <LogOut className="w-5 h-5" />
                    <span className={cn("text-sm font-medium transition-all duration-300 overflow-hidden", isOpen ? "w-auto opacity-100" : "w-0 opacity-0 hidden")}>Log Out</span>
                </button>
            </div>
        </aside>
    );
};
