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
        <div className="min-h-screen flex items-center justify-center bg-[#050505] p-6 relative overflow-hidden">
            {/* Decorative Gradients */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full -z-10" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/10 blur-[120px] rounded-full -z-10" />

            <Card className="max-w-md w-full p-10 space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-[0_0_30px_rgba(247,147,26,0.2)] mb-4 animate-float">
                        <Bitcoin className="text-black w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight gradient-text">BTC Manager</h1>
                    <p className="text-gray-500 text-sm">
                        {step === 'email' ? 'Sign in with your authorized email.' : `Enter the code sent to ${email}`}
                    </p>
                </div>

                <form onSubmit={step === 'email' ? handleSendOtp : handleLogin} className="space-y-4">
                    {step === 'email' ? (
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">
                                Email Address
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full bg-[#101010] border border-border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">
                                Verification Code
                            </label>
                            <div className="relative group">
                                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="text"
                                    placeholder="123456"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                    className="w-full bg-[#101010] border border-border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all tracking-[0.5em] font-mono text-center text-lg"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep('email')}
                                className="text-xs text-gray-500 hover:text-white underline transition-colors w-full text-center"
                            >
                                Change email
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded-xl">
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

                <p className="text-center text-xs text-gray-600">
                    This is a private administrative dashboard. <br />
                    Access is restricted to authorized personnel only.
                </p>
            </Card>
        </div>
    );
}
