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
        <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 bg-background">
            <Card className="relative w-full max-w-[26rem] space-y-7 p-6 sm:p-9">
                <div className="text-center space-y-2.5">
                    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                        <Bitcoin className="h-6 w-6" />
                    </div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-faint">Private access</p>
                    <h1 className="font-display text-2xl font-medium text-foreground">BTC Manager</h1>
                    <p className="mx-auto max-w-sm text-sm leading-6 text-muted">
                        {step === 'email' ? 'Sign in with your authorized email to access your portfolio.' : `Enter the code sent to ${email}`}
                    </p>
                </div>

                <form onSubmit={step === 'email' ? handleSendOtp : handleLogin} className="space-y-4">
                    {step === 'email' ? (
                        <div className="space-y-2">
                            <label className="ml-1 text-xs font-medium uppercase tracking-wider text-faint">
                                Email address
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint transition-colors group-focus-within:text-primary" />
                                <input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full rounded-lg border border-border bg-white/[0.03] py-3 pl-10 pr-4 text-foreground placeholder:text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="ml-1 text-xs font-medium uppercase tracking-wider text-faint">
                                Verification code
                            </label>
                            <div className="relative group">
                                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint transition-colors group-focus-within:text-primary" />
                                <input
                                    type="text"
                                    placeholder="123456"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                    className="w-full rounded-lg border border-border bg-white/[0.03] py-3 pl-10 pr-4 text-center font-num text-lg tracking-[0.4em] text-foreground placeholder:text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep('email')}
                                className="w-full text-center text-xs text-faint underline transition-colors hover:text-foreground"
                            >
                                Change email
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
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
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                {step === 'email' ? 'Send code' : 'Secure login'}
                                <ArrowRight className="w-4 h-4 ml-1" />
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-center text-xs leading-5 text-faint">
                    This is a private administrative dashboard.<br />
                    Access is restricted to authorized personnel only.
                </p>
            </Card>
        </div>
    );
}
