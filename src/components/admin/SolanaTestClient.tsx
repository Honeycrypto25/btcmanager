"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/core";
import { runSolanaTest, type SolanaTestId } from "@/app/actions/solana-test";

interface TestDef {
    id: SolanaTestId;
    title: string;
    detail: string;
    cost: string;
    confirm?: string;
}

const DEVNET: TestDef[] = [
    { id: "signing", title: "1. Cheie + semnare (fără rețea)", detail: "Încarcă cheia de test, construiește și semnează o tranzacție, verifică semnătura criptografic.", cost: "Gratuit, nu trimite nimic" },
    { id: "balances-devnet", title: "2. Sold pe devnet", detail: "Citește soldul SOL și înălțimea blocului prin RPC-ul devnet.", cost: "Gratuit" },
    { id: "airdrop", title: "3. Airdrop 1 SOL (devnet)", detail: "Cere SOL de test de la faucet-ul public. Faucet-ul e des limitat; dacă refuză, folosește faucet.solana.com cu adresa de mai sus.", cost: "Gratuit" },
    { id: "transfer-devnet", title: "4. Transfer pe devnet", detail: "Trimite 0.001 SOL de la walletul de test către el însuși și așteaptă confirmarea.", cost: "Doar taxa de rețea, în SOL de test" },
];

const MAINNET: TestDef[] = [
    { id: "balances-mainnet", title: "5. Sold pe mainnet", detail: "Citește soldul SOL și USDC al walletului de test.", cost: "Gratuit" },
    { id: "transfer-mainnet", title: "6. Transfer pe mainnet", detail: "Trimite 0.001 SOL de la walletul de test către el însuși.", cost: "Taxa de rețea (~0.000005 SOL)", confirm: "Trimit o tranzacție reală pe mainnet din walletul de test (0.001 SOL către el însuși). Continui?" },
    { id: "swap", title: "7. Swap Jupiter $1", detail: "Cumpără SOL de $1 USDC prin Jupiter, semnat cu biblioteca nouă.", cost: "$1 USDC devine SOL + taxe mici", confirm: "Fac un swap real de $1 USDC → SOL pe mainnet din walletul de test. Continui?" },
    { id: "limit-order", title: "8. Ordin limit: plasare + anulare", detail: "Plasează un ordin de cumpărare de $5 la −50% sub preț (nu se poate executa), apoi îl anulează. USDC se întorc la anulare.", cost: "Blochează temporar $5 USDC + taxe de rețea", confirm: "Plasez un ordin limit real de $5 pe mainnet din walletul de test și îl anulez imediat. Continui?" },
    { id: "sell-order", title: "9. Ordin de vânzare: plasare + anulare", detail: "Plasează un ordin de vânzare SOL → USDC de ~$5 la +100% peste preț (nu se poate executa), apoi îl anulează. E ordinul pe care botul îl pune după fiecare cumpărare.", cost: "Blochează temporar ~0.07 SOL + taxe de rețea", confirm: "Plasez un ordin real de vânzare de ~$5 în SOL pe mainnet din walletul de test și îl anulez imediat. Continui?" },
    { id: "ultra-swap", title: "10. Swap Jupiter Ultra $1", detail: "Cumpără SOL de $1 USDC prin Jupiter Ultra, API-ul cu care botul EVA cumpără.", cost: "$1 USDC devine SOL + taxe mici", confirm: "Fac un swap real de $1 USDC → SOL prin Jupiter Ultra din walletul de test. Continui?" },
    { id: "token-transfer", title: "11. Transfer de token (USDC)", detail: "Trimite 0.01 USDC din contul de token al walletului de test către el însuși. Aceleași instrucțiuni ca la retragerea EVA în cold wallet.", cost: "Taxa de rețea; USDC rămân neschimbați", confirm: "Trimit o tranzacție reală de token pe mainnet (0.01 USDC către același cont). Continui?" },
    { id: "message-signing", title: "12. Semnare de mesaj + autentificare Trigger V2", detail: "Semnează mesajul de autentificare Jupiter Trigger V2 și obține tokenul de sesiune. De asta depind ordinele EVA pe V2.", cost: "Gratuit, nu mută nimic" },
];

type Run = { state: "running" } | { state: "done"; ok: boolean; lines: string[] };

function linkify(line: string) {
    const m = line.match(/^(.*?)(https:\/\/solscan\.io\/\S+)(.*)$/);
    if (!m) return line;
    return (
        <>
            {m[1]}
            <a href={m[2]} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">
                vezi pe Solscan ↗
            </a>
            {m[3]}
        </>
    );
}

function TestRow({ t, run, disabled, onRun }: { t: TestDef; run?: Run; disabled: boolean; onRun: () => void }) {
    const done = run?.state === "done" ? run : null;
    return (
        <div className="border-t border-white/[0.06] py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                        {t.title}
                        {done && <span className={`ml-2 text-xs font-semibold ${done.ok ? "text-emerald-300" : "text-red-300"}`}>{done.ok ? "REUȘIT" : "EȘUAT"}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{t.detail}</p>
                    <p className="mt-0.5 text-[11px] text-faint">Cost: {t.cost}</p>
                </div>
                <button
                    type="button"
                    onClick={onRun}
                    disabled={disabled}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {run?.state === "running" ? "Rulează…" : done ? "Rulează din nou" : "Rulează"}
                </button>
            </div>
            {done && (
                <pre className={`mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border p-3 font-mono text-xs leading-relaxed ${done.ok ? "border-emerald-400/20 bg-emerald-400/[0.04] text-muted" : "border-red-400/30 bg-red-400/[0.05] text-red-200"}`}>
                    {done.lines.map((l, i) => (
                        <div key={i}>{linkify(l)}</div>
                    ))}
                </pre>
            )}
        </div>
    );
}

export function SolanaTestClient({ wallet }: { wallet: { configured: boolean; address: string | null; error: string | null } }) {
    const [runs, setRuns] = useState<Partial<Record<SolanaTestId, Run>>>({});
    const busy = Object.values(runs).some((r) => r?.state === "running");

    async function start(t: TestDef) {
        if (t.confirm && !window.confirm(t.confirm)) return;
        setRuns((r) => ({ ...r, [t.id]: { state: "running" } }));
        try {
            const res = await runSolanaTest(t.id);
            setRuns((r) => ({ ...r, [t.id]: { state: "done", ok: res.ok, lines: res.lines } }));
        } catch (err) {
            setRuns((r) => ({ ...r, [t.id]: { state: "done", ok: false, lines: [`✗ ${err instanceof Error ? err.message : "Testul a eșuat."}`] } }));
        }
    }

    const all = [...DEVNET, ...MAINNET];
    const passed = all.filter((t) => runs[t.id]?.state === "done" && (runs[t.id] as { ok: boolean }).ok).length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-display text-2xl font-medium text-foreground">Test Solana · web3.js v3</h1>
                <p className="mt-1 text-sm text-muted">
                    Banc de probă pentru actualizarea <code>@solana/web3.js</code> 1.99 → 3.2.1. Toate testele rulează pe biblioteca nouă și doar cu walletul de test. Botul live rămâne pe versiunea veche și pe walletul lui, neatins.
                </p>
            </div>

            <Card>
                <h2 className="text-sm font-medium text-foreground">Wallet de test</h2>
                {wallet.configured ? (
                    <p className="mt-1 break-all font-mono text-sm text-emerald-300">{wallet.address}</p>
                ) : (
                    <div className="mt-1 text-sm text-amber-300">
                        <p>{wallet.error ?? "Nu este configurat."}</p>
                        <p className="mt-2 text-xs text-muted">
                            Creează un wallet nou (de exemplu în Phantom), exportă cheia privată (base58) și adaug-o în Vercel → Settings → Environment Variables ca <code>SOLANA_TEST_PRIVATE_KEY</code>, apoi fă redeploy. Nu folosi cheia botului: pagina o refuză.
                        </p>
                    </div>
                )}
                <p className="mt-3 text-xs text-muted">Teste reușite în această sesiune: {passed} din {all.length}.</p>
            </Card>

            <Card>
                <h2 className="text-sm font-medium text-foreground">Devnet · fără bani reali</h2>
                <p className="mb-1 text-xs text-muted">Verifică partea de wallet: cheie, semnare, RPC, trimitere și confirmare.</p>
                {DEVNET.map((t) => (
                    <TestRow key={t.id} t={t} run={runs[t.id]} disabled={busy || !wallet.configured} onRun={() => start(t)} />
                ))}
            </Card>

            <Card>
                <h2 className="text-sm font-medium text-foreground">Mainnet · sume mici, din walletul de test</h2>
                <p className="mb-1 text-xs text-muted">Jupiter există doar pe mainnet. Pune în walletul de test ~0.08 SOL (taxe + ordinul de vânzare de ~$5, care se întoarce la anulare) și ~$7 USDC ($1 pentru fiecare swap, $5 se blochează temporar la ordinul limit).</p>
                {MAINNET.map((t) => (
                    <TestRow key={t.id} t={t} run={runs[t.id]} disabled={busy || !wallet.configured} onRun={() => start(t)} />
                ))}
            </Card>
        </div>
    );
}
