"use client";

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Smartphone, Loader2, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui/core';
import axios from 'axios';

export default function TotpPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
        // If user is already 2FA verified (or doesn't need it), redirect to home
        if (session?.user && !(session.user as any).requires2fa) {
            router.push('/');
        }
    }, [status, session, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data } = await axios.post('/api/auth/2fa/verify', { token });
            if (data.success) {
                // Force refresh session/page to clear requires2fa flag (handled via cookie/server state in this implementation)
                window.location.href = '/';
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    if (status === 'loading') return null;

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full -z-10" />

            <Card className="max-w-md w-full p-10 space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl mb-4 text-primary shadow-[0_0_30px_rgba(247,147,26,0.1)]">
                        <ShieldCheck className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-white mb-2">Two-Factor <span className="text-primary">Auth</span></h1>
                    <p className="text-gray-500 text-sm font-medium">Please enter the 6-digit code from your <br /> Google Authenticator app.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <div className="relative group text-center">
                            <input
                                type="text"
                                maxLength={6}
                                placeholder="000000"
                                value={token}
                                onChange={(e) => setToken(e.target.value.replace(/[^0-9]/g, ''))}
                                required
                                autoFocus
                                className="w-full bg-[#101010] border border-border rounded-2xl py-6 text-center text-4xl font-black text-white tracking-[0.3em] placeholder:text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded-xl flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <Button
                        variant="primary"
                        size="lg"
                        type="submit"
                        className="w-full py-6 text-lg font-black tracking-widest"
                        disabled={loading || token.length < 6}
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                Verify Identity
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-center text-[10px] text-gray-700 uppercase font-black tracking-widest leading-relaxed">
                    Secure Administrative Access <br />
                    Session ID: {session?.user?.email?.slice(0, 3)}...
                </p>
            </Card>
        </div>
    );
}
