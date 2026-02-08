"use client";

import React from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { Button, Card } from '@/components/ui/core';
import Link from 'next/link';

export default function VerifyRequestPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full -z-10" />

            <Card className="max-w-md w-full p-10 text-center space-y-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-glass border border-white/10 rounded-2xl mb-4">
                    <Mail className="text-primary w-8 h-8 animate-pulse" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-white">Check your email</h1>
                    <p className="text-gray-500 text-sm">
                        We've sent a magic link to your email address. <br />
                        Click the link to sign in securely.
                    </p>
                </div>

                <div className="pt-4">
                    <Link href="/auth/signin">
                        <Button variant="ghost" size="md">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Sign In
                        </Button>
                    </Link>
                </div>

                <p className="text-[10px] text-gray-700 uppercase font-bold tracking-widest">
                    Link expires in 24 hours
                </p>
            </Card>
        </div>
    );
}
