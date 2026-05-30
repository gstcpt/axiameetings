const fs = require('fs');
const path = require('path');

// 1. Create forgot-password page
const forgotDir = path.resolve('src/app/auth/forgot-password');
if (!fs.existsSync(forgotDir)) fs.mkdirSync(forgotDir, { recursive: true });

const forgotContent = `'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Mail, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState<any>({});
    const router = useRouter();

    useEffect(() => {
        fetch('/api/public')
            .then(res => res.json())
            .then(res => {
                if (res.status && res.data?.settings) setSettings(res.data.settings);
            });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            toast.error('Email is required');
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success('Password reset link sent to your email.');
                router.push('/auth/login');
            } else {
                toast.error(data.message || 'Something went wrong');
            }
        } catch (error) {
            toast.error('An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <div className="flex flex-col items-center mb-8">
                        <Link href="/" className="mb-6">
                            {settings.logo ? (
                                <Image src={\`/api/proxy-image?url=\${encodeURIComponent(settings.logo)}\`} alt="Logo" width={140} height={40} className="object-contain h-10 w-auto" />
                            ) : (
                                <div className="text-2xl font-bold text-[#002B5B]">AxiaMeetings</div>
                            )}
                        </Link>
                        <h1 className="text-2xl font-bold text-[#002B5B] text-center">Forgot Password</h1>
                        <p className="text-slate-500 text-sm mt-2 text-center">Enter your email address and we will send you a link to reset your password.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus:border-[#002B5B] focus:ring-[#002B5B]/20"
                                        placeholder="name@company.com"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-[#002B5B] hover:bg-blue-900 text-white rounded-xl font-medium transition-all shadow-md"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <Send className="w-5 h-5 mr-2" />
                                    Send Reset Link
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center">
                        <Link href="/auth/login" className="flex items-center text-sm font-medium text-slate-500 hover:text-[#002B5B] transition-colors">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
`;
fs.writeFileSync(path.join(forgotDir, 'page.tsx'), forgotContent, 'utf8');

// 2. Create reset-password page
const resetDir = path.resolve('src/app/auth/reset-password');
if (!fs.existsSync(resetDir)) fs.mkdirSync(resetDir, { recursive: true });

const resetContent = `'use client';

import { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';

function ResetPasswordForm() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState<any>({});
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            toast.error('Invalid or missing token.');
            router.push('/auth/login');
        }
        fetch('/api/public')
            .then(res => res.json())
            .then(res => {
                if (res.status && res.data?.settings) setSettings(res.data.settings);
            });
    }, [token, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || !confirmPassword) {
            toast.error('Please fill all fields');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success('Password updated successfully. You can now login.');
                router.push('/auth/login');
            } else {
                toast.error(data.message || 'Something went wrong');
            }
        } catch (error) {
            toast.error('An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <div className="flex flex-col items-center mb-8">
                        <Link href="/" className="mb-6">
                            {settings.logo ? (
                                <Image src={\`/api/proxy-image?url=\${encodeURIComponent(settings.logo)}\`} alt="Logo" width={140} height={40} className="object-contain h-10 w-auto" />
                            ) : (
                                <div className="text-2xl font-bold text-[#002B5B]">AxiaMeetings</div>
                            )}
                        </Link>
                        <h1 className="text-2xl font-bold text-[#002B5B] text-center">Reset Password</h1>
                        <p className="text-slate-500 text-sm mt-2 text-center">Enter your new password below.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <Input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus:border-[#002B5B] focus:ring-[#002B5B]/20"
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <Input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus:border-[#002B5B] focus:ring-[#002B5B]/20"
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading || !token}
                            className="w-full h-12 bg-[#002B5B] hover:bg-blue-900 text-white rounded-xl font-medium transition-all shadow-md"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Update Password
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </>
                            )}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
            <ResetPasswordForm />
        </Suspense>
    );
}
`;
fs.writeFileSync(path.join(resetDir, 'page.tsx'), resetContent, 'utf8');

// 3. Inject "Forgot Password" link into Login page
const loginPath = path.resolve('src/app/auth/login/page.tsx');
let loginText = fs.readFileSync(loginPath, 'utf8');

if (!loginText.includes('/auth/forgot-password')) {
    // We search for a specific unique piece of code near the password field in the login form.
    // It looks like `onChange={(e) => setPassword(e.target.value)}`
    // Let's replace the whole surrounding block to ensure we insert the link cleanly.
    
    // We'll replace the closing div of the password relative container with the closing div AND our link.
    const targetString = `onChange={(e) => setPassword(e.target.value)}
                                                className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus:border-[#002B5B] focus:ring-[#002B5B]/20"
                                                placeholder={t('passwordPlaceholder')}
                                                required
                                            />
                                        </div>`;

    const replacementString = `onChange={(e) => setPassword(e.target.value)}
                                                className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus:border-[#002B5B] focus:ring-[#002B5B]/20"
                                                placeholder={t('passwordPlaceholder')}
                                                required
                                            />
                                        </div>
                                        <div className="flex justify-end mt-2">
                                            <Link href="/auth/forgot-password" className="text-sm font-medium text-[#002B5B] hover:text-blue-700 transition-colors">
                                                Forgot Password?
                                            </Link>
                                        </div>`;

    if (loginText.includes(targetString)) {
        loginText = loginText.replace(targetString, replacementString);
        fs.writeFileSync(loginPath, loginText, 'utf8');
        console.log("Updated login page successfully.");
    } else {
        console.log("Could not find the exact injection point in login page, skipping link injection.");
    }
}
