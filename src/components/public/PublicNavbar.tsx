"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/context/AuthContext";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Home, ArrowLeft } from "lucide-react";
import { Typography } from "@/components/ui/typographys";
import { toast } from "sonner";

interface PublicSettings {
    logo_file_name?: string | null;
    [key: string]: any;
}

export function PublicNavbar({ settings }: { settings: PublicSettings }) {
    const { user, logout, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations('Navbar');
    const tc = useTranslations('Common');
    const isHome = pathname === "/";

    const logoSrc = settings.logo_file_name ? (settings.logo_file_name.startsWith('http') ? settings.logo_file_name : (settings.logo_file_name === "AxiaMeetings.svg" ? "/AxiaMeetings.svg" : `/uploads/${settings.logo_file_name}`)) : "/AxiaMeetings.svg";

    const handleLogout = async () => {
        try {
            await logout();
            router.push('/');
            router.refresh();
        } catch (error) { toast.error(tc('error')); }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 p-6">
            <motion.nav
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="max-w-7xl mx-auto flex justify-between items-center bg-white rounded-[2rem] px-10 py-4 border border-slate-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] transition-all duration-500"
            >
                <Link href="/" className="flex items-center hover:scale-105 transition-all duration-300 active:scale-95">
                    <Image src={logoSrc} alt="Axia Meetings" width={180} height={60} className="h-10 w-auto" priority />
                </Link>

                <div className="hidden md:flex items-center">
                    <AnimatePresence mode="wait">
                        {isHome ? (
                            <motion.div
                                key="home-nav"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="flex items-center gap-10"
                            >
                                <Link href="/#features" className="group">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('features')}</Typography>
                                </Link>
                                <Link href="/#how-it-works" className="group">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('process')}</Typography>
                                </Link>
                                <Link href="/#pricing" className="group">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('pricing')}</Typography>
                                </Link>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="other-nav"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <Link href="/" className="flex items-center gap-3 group">
                                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#002B5B] group-hover:text-white transition-all duration-300 border border-slate-100 group-hover:border-[#002B5B]">
                                        <ArrowLeft size={16} />
                                    </div>
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('returnHome')}</Typography>
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="flex items-center gap-4">
                    {!loading && (
                        user ? (
                            <>
                                <Link href="/overview" className="hidden sm:block">
                                    <Button variant="ghost" className="h-12 px-8">
                                        {t('dashboard')}
                                    </Button>
                                </Link>
                                <Button
                                    onClick={handleLogout}
                                    className="h-12 px-10 shadow-xl shadow-blue-900/20"
                                >
                                    {t('logout')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Link href="/auth/login" className="hidden sm:block">
                                    <Button variant="ghost" className="h-12 px-8">
                                        {t('login')}
                                    </Button>
                                </Link>
                                <Link href="/auth/login">
                                    <Button className="h-12 px-10 shadow-xl shadow-blue-900/20">
                                        {t('getStarted')}
                                    </Button>
                                </Link>
                            </>
                        )
                    )}
                </div>
            </motion.nav>
        </header>
    );
}
