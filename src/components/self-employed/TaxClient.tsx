"use client";

import React, { useState, useTransition } from "react";
import { Card, Button } from "@/components/ui/core";
import { Info, PiggyBank, Landmark, Wallet } from "lucide-react";
import { TaxYearSelector } from "./TaxYearSelector";
import { getTaxEstimate } from "@/app/actions/tax";

function formatGBP(amount: number): string {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(amount);
}

type TaxEstimate = Awaited<ReturnType<typeof getTaxEstimate>>;

export function TaxClient({ initialEstimate, taxYears }: { initialEstimate: TaxEstimate; taxYears: string[] }) {
    const [estimate, setEstimate] = useState<TaxEstimate>(initialEstimate);
    const [sippInput, setSippInput] = useState<string>("0");
    const [isPending, startTransition] = useTransition();

    const recalculate = (sippValue: number) => {
        startTransition(async () => {
            const next = await getTaxEstimate({ taxYear: estimate.taxYear, sippGrossContribution: sippValue });
            setEstimate(next);
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-1">
                        Calculator de <span className="gradient-text">taxe</span>
                    </h1>
                    <p className="text-muted text-sm">Estimare Income Tax + Class 4 NI pentru anul fiscal {estimate.taxYear}.</p>
                </div>
                <TaxYearSelector taxYears={taxYears} selected={estimate.taxYear} basePath="/self-employed/tax" />
            </div>

            <Card className="p-4 sm:p-5 border-amber-400/20 bg-amber-400/[0.04]">
                <div className="flex gap-3">
                    <Info className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted leading-relaxed">
                        Aceasta este o <span className="text-foreground font-medium">estimare informativă</span>, calculată din
                        înregistrările tale din Venituri/Cheltuieli. Nu ține cont de alte surse de venit (job, alte afaceri),
                        de reguli specifice Scoției, sau de contribuții la pensie făcute deja în afara acestui simulator.
                        Nu constituie consultanță fiscală — verifică cu HMRC sau un contabil înainte de a lua decizii.
                    </p>
                </div>
            </Card>

            {!estimate.rulesAvailable ? (
                <Card className="p-6">
                    <p className="text-sm text-muted">
                        Regulile fiscale pentru anul <span className="text-foreground font-medium">{estimate.taxYear}</span> nu
                        sunt încă disponibile în calculator. Profit din Self Employed pentru acest an:{" "}
                        <span className="text-foreground font-medium">{formatGBP(estimate.ytdProfit)}</span>. Verifică{" "}
                        <a href="https://www.gov.uk/income-tax-rates" target="_blank" rel="noreferrer" className="text-primary underline">
                            gov.uk
                        </a>{" "}
                        pentru ratele exacte ale acestui an.
                    </p>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Card className="p-5 sm:p-6">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">Profit YTD</p>
                                <Wallet className="w-4 h-4 text-primary" />
                            </div>
                            <p className="font-num text-2xl font-medium text-foreground">{formatGBP(estimate.ytdProfit)}</p>
                            {estimate.isCurrentYear && estimate.progress && (
                                <p className="text-xs text-muted mt-1">
                                    ziua {estimate.progress.dayOfYear} din {estimate.progress.totalDays} ale anului fiscal
                                </p>
                            )}
                        </Card>

                        <Card className="p-5 sm:p-6">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">
                                    {estimate.isCurrentYear ? "Profit proiectat (an complet)" : "Profit (an fiscal)"}
                                </p>
                                <Landmark className="w-4 h-4 text-accent" />
                            </div>
                            <p className="font-num text-2xl font-medium text-foreground">{formatGBP(estimate.projectedProfit)}</p>
                            {estimate.isCurrentYear && (
                                <p className="text-xs text-muted mt-1">Proiecție liniară din media zilnică YTD</p>
                            )}
                        </Card>

                        <Card className="p-5 sm:p-6">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] text-muted uppercase text-xs font-medium tracking-wider">
                                    Taxă estimată (Income Tax + NI)
                                </p>
                                <PiggyBank className="w-4 h-4 text-red-400" />
                            </div>
                            <p className="font-num text-2xl font-medium text-red-400">{formatGBP(estimate.projected.total)}</p>
                            <p className="text-xs text-muted mt-1">
                                Venit net estimat: {formatGBP(estimate.projectedProfit - estimate.projected.total)}
                            </p>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="p-5 sm:p-6">
                            <p className="font-medium text-foreground mb-1">Income Tax</p>
                            <p className="text-xs text-muted mb-4">
                                Personal Allowance: {formatGBP(estimate.projected.incomeTax.personalAllowance)} · Venit
                                impozabil: {formatGBP(estimate.projected.incomeTax.taxableIncome)}
                            </p>
                            <div className="space-y-2">
                                {estimate.projected.incomeTax.bands.length === 0 ? (
                                    <p className="text-sm text-muted">Sub Personal Allowance — fără Income Tax datorat.</p>
                                ) : (
                                    estimate.projected.incomeTax.bands.map((b) => (
                                        <div key={b.band} className="flex items-center justify-between text-sm">
                                            <span className="text-muted">{b.band}</span>
                                            <span className="font-num text-foreground">{formatGBP(b.tax)}</span>
                                        </div>
                                    ))
                                )}
                                <div className="flex items-center justify-between text-sm pt-2 hairline-top">
                                    <span className="text-foreground font-medium">Total Income Tax</span>
                                    <span className="font-num text-foreground font-medium">
                                        {formatGBP(estimate.projected.incomeTax.totalTax)}
                                    </span>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-5 sm:p-6">
                            <p className="font-medium text-foreground mb-1">Class 4 National Insurance</p>
                            <p className="text-xs text-muted mb-4">
                                Prag: {formatGBP(estimate.rules.class4LowerLimit)} – {formatGBP(estimate.rules.class4UpperLimit)}
                            </p>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">
                                        Rată principală ({(estimate.rules.class4MainRate * 100).toFixed(2)}%)
                                    </span>
                                    <span className="font-num text-foreground">{formatGBP(estimate.projected.ni.mainRateTax)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">
                                        Rată adițională ({(estimate.rules.class4AdditionalRate * 100).toFixed(2)}%)
                                    </span>
                                    <span className="font-num text-foreground">{formatGBP(estimate.projected.ni.additionalRateTax)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm pt-2 hairline-top">
                                    <span className="text-foreground font-medium">Total Class 4 NI</span>
                                    <span className="font-num text-foreground font-medium">{formatGBP(estimate.projected.ni.totalNi)}</span>
                                </div>
                            </div>
                            <p className="text-xs text-faint mt-4">{estimate.rules.class2Note}</p>
                        </Card>
                    </div>

                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-1">
                            <PiggyBank className="w-4 h-4 text-primary" />
                            <p className="font-medium text-foreground">Simulator SIPP / pensie privată</p>
                        </div>
                        <p className="text-xs text-muted mb-4 leading-relaxed">
                            O contribuție la un SIPP (relief-at-source) extinde pragul ratei de bază, astfel încât mai mult din
                            profit e taxat la 20%/40% în loc de 40%/45%. Introdu suma <span className="text-foreground">brută</span> a
                            contribuției (dacă plătești £800 din cont, cu relief-at-source devine automat £1000 brut). Nu creează
                            nicio înregistrare de cheltuială — e doar un calcul separat, informativ.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted">Contribuție brută anuală</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={100}
                                    value={sippInput}
                                    onChange={(e) => setSippInput(e.target.value)}
                                    className="w-32 rounded-lg border border-border bg-glass px-3 py-2 text-sm text-foreground font-num focus:outline-none focus:border-primary/50"
                                />
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={isPending}
                                onClick={() => recalculate(Number(sippInput) || 0)}
                            >
                                {isPending ? "Calculează..." : "Calculează impactul"}
                            </Button>
                            {estimate.sippGrossContribution > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() => {
                                        setSippInput("0");
                                        recalculate(0);
                                    }}
                                >
                                    Resetează
                                </Button>
                            )}
                        </div>

                        {estimate.sippGrossContribution > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 hairline-top">
                                <div>
                                    <p className="text-xs text-muted uppercase tracking-wider mb-1">Fără SIPP</p>
                                    <p className="font-num text-lg text-foreground">{formatGBP(estimate.projectedNoSipp.total)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted uppercase tracking-wider mb-1">
                                        Cu SIPP ({formatGBP(estimate.sippGrossContribution)} brut)
                                    </p>
                                    <p className="font-num text-lg text-foreground">{formatGBP(estimate.projected.total)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted uppercase tracking-wider mb-1">Economie estimată</p>
                                    <p className="font-num text-lg text-green-400">
                                        {formatGBP(Math.max(0, estimate.projectedNoSipp.total - estimate.projected.total))}
                                    </p>
                                </div>
                            </div>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}
