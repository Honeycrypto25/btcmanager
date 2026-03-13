"use client";

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Bitcoin, Mail, Loader2, ArrowRight, KeyRound } from 'lucide-react';
import { Button, Card } from '@/components/ui/core';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
    const router = useRouter();
    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to send code');
            }

            setStep('otp');
        } catch (err: any) {
            if (err.message === "Access Denied") {
                setError("This email is not authorized.");
            } else {
                setError(err.message || 'An unexpected error occurred.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await signIn('otp', {
                email,
                code,
                redirect: false,
                callbackUrl: '/',
            });

            if (res?.error) {
                setError('Invalid code. Please try again.');
            } else {
                router.push('/');
            }
        } catch (err) {
            setError('An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(214,169,95,0.16),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(142,197,164,0.12),transparent_28%)]" />

            <Card className="relative w-full max-w-[28rem] space-y-8 p-6 sm:p-10 animate-in fade-in zoom-in duration-500">
                <div className="text-center space-y-3">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-[1.35rem] border border-primary/30 bg-primary/12 text-primary shadow-[0_18px_40px_rgba(214,169,95,0.16)] animate-float">
                        <Bitcoin className="h-9 w-9" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-stone-500">Private access</p>
                    <h1 className="font-display text-5xl leading-none gradient-text">BTC Manager</h1>
                    <p className="mx-auto max-w-sm text-sm leading-6 text-stone-400">
                        {step === 'email' ? 'Sign in with your authorized email to access the portfolio control room.' : `Enter the code sent to ${email}`}
                    </p>
                </div>

                <form onSubmit={step === 'email' ? handleSendOtp : handleLogin} className="space-y-4">
                    {step === 'email' ? (
                        <div className="space-y-2">
                            <label className="ml-1 text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                                Email Address
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500 transition-colors group-focus-within:text-primary" />
                                <input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full rounded-[1.35rem] border border-border bg-white/[0.04] py-4 pl-12 pr-4 text-white placeholder:text-stone-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="ml-1 text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                                Verification Code
                            </label>
                            <div className="relative group">
                                <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500 transition-colors group-focus-within:text-primary" />
                                <input
                                    type="text"
                                    placeholder="123456"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                    className="w-full rounded-[1.35rem] border border-border bg-white/[0.04] py-4 pl-12 pr-4 text-center font-mono text-lg tracking-[0.5em] text-white placeholder:text-stone-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep('email')}
                                className="w-full text-center text-xs text-stone-500 underline transition-colors hover:text-white"
                            >
                                Change email
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <Button
                        variant="primary"
                        size="lg"
                        type="submit"
                        className="w-full"
                        disabled={loading}
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {step === 'email' ? 'Send Code' : 'Secure Login'}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-center text-xs leading-5 text-stone-500">
                    This is a private administrative dashboard. <br />
                    Access is restricted to authorized personnel only.
                </p>
            </Card>
        </div>
    );
}
