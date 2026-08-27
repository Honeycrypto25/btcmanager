"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button, cn } from "@/components/ui/core";

const DISMISS_STORAGE_KEY = "btcmanager:pwa-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 zile

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    return (
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
}

function isIos(): boolean {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function wasRecentlyDismissed(): boolean {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    if (Number.isNaN(dismissedAt)) return false;
    return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

/**
 * Dismissible bottom banner offering to install the app to the home screen.
 * Chrome/Edge/Android fire `beforeinstallprompt` — we intercept it and show
 * our own "Instalează" button instead of the (easy to miss) native mini-bar.
 * iOS Safari never fires that event, so there we show simple instructions
 * for the manual Share → "Add to Home Screen" flow instead.
 * Never shown inside /auth/* (nothing to install yet) or once the app is
 * already running standalone.
 */
export function InstallBanner() {
    const pathname = usePathname();
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showIosHint, setShowIosHint] = useState(false);
    const [visible, setVisible] = useState(false);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        if (isStandalone() || wasRecentlyDismissed()) return;

        if (isIos()) {
            setShowIosHint(true);
            setVisible(true);
            return;
        }

        const onBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setVisible(true);
        };
        const onInstalled = () => {
            setVisible(false);
            setDeferredPrompt(null);
        };

        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const dismiss = () => {
        setVisible(false);
        window.localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    };

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        setInstalling(true);
        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
                setVisible(false);
            } else {
                dismiss();
            }
        } finally {
            setDeferredPrompt(null);
            setInstalling(false);
        }
    };

    if (!visible || pathname?.startsWith("/auth")) return null;

    return (
        <div
            className={cn(
                "fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
                "animate-in fade-in slide-in-from-bottom-4 duration-300"
            )}
        >
            <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-border bg-[#141311] p-4 shadow-2xl shadow-black/40 sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    {showIosHint ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Instalează Personal Dashboard</p>
                    {showIosHint ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                            Apasă <Share className="inline h-3.5 w-3.5 -mt-0.5" /> (Share) din Safari, apoi{" "}
                            <span className="inline-flex items-center gap-1 text-foreground">
                                <SquarePlus className="h-3.5 w-3.5" /> Add to Home Screen
                            </span>
                            .
                        </p>
                    ) : (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                            Adaugă aplicația pe ecranul principal — pornește mai rapid și fără bara de browser.
                        </p>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    {!showIosHint && (
                        <Button variant="primary" size="sm" onClick={handleInstall} disabled={installing}>
                            Instalează
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Închide">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
