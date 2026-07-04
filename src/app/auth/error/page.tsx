"use client";

import React from 'react';
import { ShieldAlert, ArrowLeft, RefreshCcw } from 'lucide-react';
import { Button, Card } from '@/components/ui/core';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ErrorContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    const errorMessages: Record<string, string> = {
        'Configuration': 'There is a problem with the server configuration.',
        'AccessDenied': 'You do not have permission to access this dashboard.',
        'Verification': 'The sign-in link is no longer valid or has already been used.',
        'Default': 'An unexpected error occurred during authentication.',
    };

    const message = errorMessages[error || 'Default'] || errorMessages.Default;

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <Card className="max-w-md w-full p-8 text-center space-y-6 border-red-500/20">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-lg mb-3">
                    <ShieldAlert className="text-red-400 w-6 h-6" />
                </div>

                <div className="space-y-2">
                    <h1 className="font-display text-xl font-medium text-foreground">Authentication error</h1>
                    <p className="text-muted text-sm">{message}</p>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                    <Link href="/auth/signin">
                        <Button variant="primary" className="w-full">
                            <RefreshCcw className="w-4 h-4 mr-2" />
                            Try again
                        </Button>
                    </Link>
                    <Link href="/">
                        <Button variant="ghost" className="w-full">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to home
                        </Button>
                    </Link>
                </div>
            </Card>
        </div>
    );
}

export default function AuthErrorPage() {
    return (
        <Suspense fallback={null}>
            <ErrorContent />
        </Suspense>
    );
}
