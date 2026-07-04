"use client";

import React from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import { Button, Card } from '@/components/ui/core';
import Link from 'next/link';

export default function VerifyRequestPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <Card className="max-w-md w-full p-8 text-center space-y-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 border border-primary/20 rounded-lg mb-3">
                    <Mail className="text-primary w-6 h-6" />
                </div>

                <div className="space-y-2">
                    <h1 className="font-display text-xl font-medium text-foreground">Check your email</h1>
                    <p className="text-muted text-sm">
                        We've sent a magic link to your email address. <br />
                        Click the link to sign in securely.
                    </p>
                </div>

                <div className="pt-4">
                    <Link href="/auth/signin">
                        <Button variant="ghost" size="md">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to sign in
                        </Button>
                    </Link>
                </div>

                <p className="text-[10px] text-faint uppercase font-medium tracking-wider">
                    Link expires in 24 hours
                </p>
            </Card>
        </div>
    );
}
