"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Wallet,
    History,
    Lock,
    LayoutGrid,
    LogOut,
    TrendingUp,
    TrendingDown,
    LineChart,
    X,
    Globe,
    BarChart3,
    Briefcase,
    Receipt,
    FileText,
    ListChecks,
    ScanLine,
    Landmark,
    Calculator,
    Car,
    Folder,
    BellRing,
    PiggyBank,
    Building2,
    Target,
    Layers,
    Coins,
    Hexagon,
    Diamond,
    Repeat,
    Sparkles
} from 'lucide-react';
import { cn } from '@/components/ui/core';
import { signOut, useSession } from 'next-auth/react';

type NavLeaf = { name: string; href: string; icon: React.ElementType };
type NavSection = { section: string; items: NavLeaf[]; sectionKey?: string };
type NavEntry = NavLeaf | NavSection;

// Which permission key (see SECTION_KEYS in src/lib/permissions.ts) gates
// each sidebar group. Groups without a key here are admin-only (Overview,
// Tasks, Admin) and are hidden entirely from viewers.

const navEntries: NavEntry[] = [
    { name: 'Overview', href: '/', icon: Globe },
    {
        section: 'Bitcoin',
        sectionKey: 'btc',
        items: [
            { name: 'Dashboard', href: '/btc', icon: LayoutDashboard },
            { name: 'Wallets', href: '/btc/wallets', icon: Wallet },
            { name: 'History', href: '/btc/history', icon: History },
            { name: 'ROI', href: '/btc/roi', icon: TrendingUp },
            { name: 'Analytics', href: '/btc/analytics', icon: LineChart },
            { name: 'Cycles', href: '/btc/cycle', icon: TrendingDown },
        ],
    },
    {
        section: 'Trading 212',
        sectionKey: 't212',
        items: [
            { name: 'Dashboard', href: '/t212', icon: BarChart3 },
        ],
    },
    {
        section: 'Investiții',
        sectionKey: 'investments',
        items: [
            { name: 'Overview unificat', href: '/investments', icon: Layers },
            { name: 'Vanguard', href: '/vanguard', icon: PiggyBank },
            { name: 'Fidelity', href: '/fidelity', icon: Building2 },
            { name: 'Goals', href: '/goals', icon: Target },
        ],
    },
    {
        section: 'Solana',
        sectionKey: 'solana',
        items: [
            { name: 'DCA automat', href: '/solana', icon: Coins },
            { name: 'Statistici', href: '/solana/stats', icon: BarChart3 },
            { name: 'Eva (DCA)', href: '/solana/eva', icon: Sparkles },
            { name: 'Eva Statistici', href: '/solana/eva/stats', icon: BarChart3 },
        ],
    },
    {
        section: 'Base (ETH)',
        sectionKey: 'base',
        items: [
            { name: 'DCA automat', href: '/base', icon: Hexagon },
            { name: 'Statistici', href: '/base/stats', icon: BarChart3 },
        ],
    },
    {
        section: 'BNB Chain',
        sectionKey: 'bnb',
        items: [
            { name: 'DCA automat', href: '/bnb', icon: Diamond },
            { name: 'Statistici', href: '/bnb/stats', icon: BarChart3 },
        ],
    },
    {
        section: 'Polygon',
        sectionKey: 'polygon',
        items: [
            { name: 'Reverse-DCA', href: '/polygon', icon: Repeat },
            { name: 'Statistici', href: '/polygon/stats', icon: BarChart3 },
        ],
    },
    {
        section: 'Self Employed',
        sectionKey: 'selfEmployed',
        items: [
            { name: 'Overview', href: '/self-employed', icon: Briefcase },
            { name: 'Income', href: '/self-employed/income', icon: TrendingUp },
            { name: 'Expenses', href: '/self-employed/expenses', icon: Receipt },
            { name: 'Receipts', href: '/self-employed/receipts', icon: ScanLine },
            { name: 'Bank', href: '/self-employed/bank', icon: Landmark },
            { name: 'Tax', href: '/self-employed/tax', icon: Calculator },
            { name: 'Reports', href: '/self-employed/reports', icon: FileText },
        ],
    },
    {
        section: 'Vehicule & Documente',
        sectionKey: 'vehicles',
        items: [
            { name: 'Vehicule', href: '/vehicles', icon: Car },
            { name: 'Documente', href: '/documents', icon: Folder },
            { name: 'Reminders', href: '/reminders', icon: BellRing },
        ],
    },
    { name: 'Tasks', href: '/tasks', icon: ListChecks },
    { name: 'Admin', href: '/admin', icon: Lock },
];

interface SidebarProps {
    isOpen: boolean;
    toggle: () => void;
}

export const Sidebar = ({ isOpen, toggle }: SidebarProps) => {
    const pathname = usePathname();
    const { data: session } = useSession();
    const isAdmin = Boolean((session?.user as any)?.isAdmin);
    const allowedSections: string[] = Array.isArray((session?.user as any)?.allowedSections)
        ? (session!.user as any).allowedSections
        : [];

    // Admin sees everything, unfiltered. A viewer only sees: (a) leaf links
    // with no section (none currently — Overview/Tasks/Admin are filtered
    // out below by name) and (b) sections in their allow-list.
    const visibleEntries = session
        ? navEntries.filter((entry) => {
              if ('href' in entry) {
                  // Standalone leaves (Overview, Tasks, Admin) are admin-only.
                  return isAdmin;
              }
              if (!entry.sectionKey) return isAdmin;
              return isAdmin || allowedSections.includes(entry.sectionKey);
          })
        : [];

    const renderLeaf = (item: NavLeaf, close: () => void) => {
        const isActive = pathname === item.href;
        return (
            <Link
                key={item.href}
                href={item.href}
                onClick={close}
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
    };

    const handleLinkClick = () => {
        if (window.innerWidth < 1024) {
            toggle();
        }
    };

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
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
                    <div className="mb-2 flex items-center justify-between gap-3 px-1">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                                <LayoutGrid className="h-5 w-5" />
                            </div>
                            <p className="font-display text-lg font-medium leading-none text-foreground">Personal Dashboard</p>
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

                    {visibleEntries.map((entry) => {
                        if ('href' in entry) {
                            return (
                                <nav key={entry.href} className="space-y-0.5">
                                    {renderLeaf(entry, handleLinkClick)}
                                </nav>
                            );
                        }
                        return (
                            <div key={entry.section} className="space-y-0.5">
                                <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-faint">
                                    {entry.section}
                                </p>
                                <nav className="space-y-0.5">
                                    {entry.items.map((item) => renderLeaf(item, handleLinkClick))}
                                </nav>
                            </div>
                        );
                    })}
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
