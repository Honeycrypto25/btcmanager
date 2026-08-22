import { Lock } from "lucide-react";

export default function NoAccessPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
            <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-white/5">
                    <Lock className="h-5 w-5 text-muted" />
                </div>
                <h1 className="mb-2 font-display text-lg font-medium">Fără acces</h1>
                <p className="text-sm text-muted">
                    Contul tău nu are nicio secțiune activată. Cere administratorului să-ți acorde acces din pagina de Admin.
                </p>
            </div>
        </div>
    );
}
