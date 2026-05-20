'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/context/AuthContext';
import { ArrowRight, Lock, Mail, ShieldCheck, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { Badge } from '@/components/ui/badges';
import { cn, formatLogoUrl } from '@/lib/utils';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login, isAuthenticated, loading } = useAuth();
    const [settings, setSettings] = useState<any>({});
    const router = useRouter();
    const t = useTranslations('Auth.login');

    useEffect(() => {
        fetch('/api/public')
            .then(res => res.json())
            .then(res => {
                if (res.status && res.data?.settings) {
                    setSettings(res.data.settings);
                }
            });
    }, []);

    useEffect(() => {
        if (!loading && isAuthenticated) {
            router.replace('/overview');
        }
    }, [isAuthenticated, loading, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            toast.error(t('errorFields'));
            return;
        }
        setIsLoading(true);
        try {
            await login({ username: username.trim(), password });
            router.replace('/overview');
        } catch (err: any) {
            toast.error(err.message || t('errorAuth'));
        } finally {
            setIsLoading(false);
        }
    };

    if (loading) return null;

    return (
        <div className="flex flex-col min-h-screen bg-[#FDFDFD]">
            <PublicNavbar settings={settings} />

            <main className="flex-grow flex items-center justify-center pt-48 pb-24 px-6 relative overflow-hidden">
                {/* Advanced Background Decorative Gradients */}
                <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-linear-to-br from-blue-100/40 to-transparent rounded-full blur-[140px] -translate-y-1/2 translate-x-1/3 -z-10"></div>
                <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-linear-to-tr from-indigo-50/60 to-transparent rounded-full blur-[120px] translate-y-1/3 -translate-x-1/4 -z-10"></div>

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
                    className="w-full max-w-xl relative z-10"
                >
                    <div className="bg-white rounded-[2rem] md:rounded-[4rem] shadow-[0_80px_160px_-40px_rgba(0,43,91,0.15)] border border-slate-100 overflow-hidden">
                        <div className="bg-[#002B5B] px-8 md:px-16 pt-16 md:pt-24 pb-12 md:pb-20 text-center flex flex-col items-center relative overflow-hidden">
                            {/* Animated Background Pattern */}
                            <motion.div
                                animate={{ opacity: [0.05, 0.1, 0.05] }}
                                transition={{ duration: 5, repeat: Infinity }}
                                className="absolute inset-0"
                                style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}
                            ></motion.div>
                            <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-black/20 to-transparent pointer-events-none"></div>

                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="relative z-10"
                            >
                                <Image
                                    src={formatLogoUrl(settings.logo_file_name) || "/AxiaMeetings.svg"}
                                    alt="Axia Meetings"
                                    width={320}
                                    height={100}
                                    className="h-12 md:h-20 w-auto"
                                    style={{ filter: 'brightness(0) invert(1)' }}
                                    priority
                                />
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="mt-10 relative z-10 space-y-4"
                            >
                                <Badge variant="primary" className="bg-white/10 text-white border-white/20 h-7 px-4 text-[9px] uppercase font-black tracking-widest backdrop-blur-md">
                                    Secure Gateway
                                </Badge>
                                <Typography variant="p" className="text-blue-200/90 text-base md:text-lg font-medium italic">
                                    {t('subtitle')}
                                </Typography>
                            </motion.div>
                        </div>

                        <form onSubmit={handleSubmit} className="px-8 md:px-16 py-12 md:py-20 space-y-8 md:space-y-10">
                            <div className="space-y-6">
                                <Input
                                    label={t('email')}
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder={t('emailPlaceholder')}
                                    icon={Mail}
                                    required
                                    autoComplete="username"
                                />

                                <Input
                                    label={t('password')}
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    icon={Lock}
                                    required
                                    autoComplete="current-password"
                                />
                            </div>

                            <motion.label
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                                className={cn(
                                    "flex items-start gap-4 md:gap-6 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border transition-all duration-300 cursor-pointer group",
                                    acceptedTerms ? "bg-blue-50/50 border-blue-200" : "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
                                )}
                            >
                                <div className="relative mt-1">
                                    <input
                                        id="terms"
                                        type="checkbox"
                                        checked={acceptedTerms}
                                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={cn(
                                        "w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all duration-300",
                                        acceptedTerms ? "bg-[#002B5B] border-[#002B5B] shadow-lg shadow-blue-900/20" : "bg-white border-slate-300"
                                    )}>
                                        <AnimatePresence>
                                            {acceptedTerms && (
                                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                                    <CheckCircle2 className="w-5 h-5 text-white" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                <Typography variant="muted" className="leading-relaxed group-hover:text-slate-600 transition-colors text-sm">
                                    {t.rich('termsNote', {
                                        terms: (chunks) => <Link href="/terms-of-use" target="_blank" className="text-[#002B5B] hover:text-blue-700 font-black decoration-[#002B5B]/30 decoration-2 underline-offset-4">{chunks}</Link>,
                                        privacy: (chunks) => <Link href="/privacy-policy" target="_blank" className="text-[#002B5B] hover:text-blue-700 font-black decoration-[#002B5B]/30 decoration-2 underline-offset-4">{chunks}</Link>
                                    })}
                                </Typography>
                            </motion.label>

                            <Button
                                type="submit"
                                disabled={isLoading || !acceptedTerms}
                                className="w-full h-16 md:h-20 text-lg md:text-xl shadow-2xl shadow-blue-900/30 rounded-2xl md:rounded-3xl uppercase font-black tracking-widest relative group overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-blue-600 to-[#002B5B] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                <span className="relative z-10 flex items-center justify-center gap-3">
                                    {isLoading ? (
                                        <Loader2 className="w-7 h-7 animate-spin" />
                                    ) : (
                                        <>
                                            {t('submit')}
                                            <ArrowRight className="w-6 h-6 group-hover:translate-x-3 transition-transform duration-500" />
                                        </>
                                    )}
                                </span>
                            </Button>

                            <div className="flex items-center justify-center gap-4 text-slate-300 pt-4">
                                <ShieldCheck size={18} />
                                <Typography variant="muted" className="text-[10px] uppercase font-black tracking-[0.2em]">End-to-End Encryption Enabled</Typography>
                            </div>
                        </form>
                    </div>
                </motion.div>
            </main>

            <PublicFooter settings={settings} />
        </div>
    );
}
