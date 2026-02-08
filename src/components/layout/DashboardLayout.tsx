"use client";

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '@/components/ui/core';

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <div className="flex min-h-screen bg-[#050505]">
            {/* Sidebar background and component */}
            <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />

            {/* Main Content Area */}
            <main className={cn(
                "flex-1 p-10 transition-all duration-300",
                isSidebarOpen ? "ml-64" : "ml-20"
            )}>
                <div className="max-w-7xl mx-auto space-y-10">
                    {children}
                </div>
            </main>

            {/* Decorative Gradients for Premium Look */}
            <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-primary/5 blur-[150px] rounded-full pointer-events-none" />
            <div className={cn(
                "fixed bottom-0 -z-10 w-[400px] h-[400px] bg-secondary/5 blur-[120px] rounded-full pointer-events-none transition-all duration-300",
                isSidebarOpen ? "left-64" : "left-20"
            )} />
        </div>
    );
};
