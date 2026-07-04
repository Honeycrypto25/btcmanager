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
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <Card className="max-w-md w-full p-8 space-y-7">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 border border-primary/20 rounded-lg mb-3 text-primary">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h1 className="font-display text-2xl font-medium text-foreground">Two-factor auth</h1>
                    <p className="text-muted text-sm">Enter the 6-digit code from your <br /> authenticator app.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
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
                                className="w-full bg-white/[0.03] border border-border rounded-lg py-4 text-center text-2xl font-num text-foreground tracking-[0.3em] placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary transition-colors"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-400/20 text-red-300 text-sm p-3 rounded-lg flex items-center gap-3">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <Button
                        variant="primary"
                        size="lg"
                        type="submit"
                        className="w-full"
                        disabled={loading || token.length < 6}
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                Verify identity
                                <ArrowRight className="w-4 h-4 ml-1" />
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-center text-[10px] text-faint uppercase font-medium tracking-wider leading-relaxed">
                    Secure administrative access <br />
                    Session ID: {session?.user?.email?.slice(0, 3)}...
                </p>
            </Card>
        </div>
    );
}
