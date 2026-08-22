"use client";

import { Lock, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export default function NoAccessPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
            <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-white/5">
                    <Lock className="h-5 w-5 text-muted" />
                </div>
                <h1 className="mb-2 font-display text-lg font-medium">Fără acces</h1>
                <p className="text-sm text-muted">
                    Contul tău nu are nicio secțiune activată, sau sesiunea ta e mai veche decât ultima
                    actualizare a permisiunilor. Deconectează-te și autentifică-te din nou — dacă tot nu
                    merge, cere administratorului să-ți acorde acces din pagina de Admin.
                </p>
                <button
                    onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
                >
                    <LogOut className="h-4 w-4" />
                    Deconectare
                </button>
            </div>
        </div>
    );
}
