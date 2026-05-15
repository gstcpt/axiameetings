'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
    Home,
    BarChart3,
    Settings,
    Calendar,
    ChevronRight,
    LogOut,
    Building2,
    Users,
    Webhook,
    Link2,
    FileText,
    X,
    Mail,
    Globe,
    Package,
    MessageCircle,
    Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/context/AuthContext';
import { UserRole } from '@/lib/enums/users';
import { cn } from '@/lib/utils';

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname();
    const { user } = useAuth();
    const t = useTranslations('Dashboard.sidebar');
    const tc = useTranslations('Common');
    const locale = useLocale();
    const isRtl = locale === 'ar';
    const isDeveloper = user?.role === UserRole.DEVELOPER;
    const isAdmin = user?.role === UserRole.ADMIN;

    const mainItems = [
        { icon: Home, label: t('overview'), href: '/overview' },
        { icon: Calendar, label: t('meetings'), href: '/meetings' },
    ];

    const adminItems = [];
    if (isAdmin) {
        adminItems.push({ icon: Users, label: t('users'), href: '/users' });
        adminItems.push({ icon: Link2, label: t('linkApp'), href: '/companies/link' });
    }

    const developerItems = [];
    if (isDeveloper) {
        developerItems.push({ icon: Building2, label: t('companies'), href: '/companies' });
        developerItems.push({ icon: Users, label: t('admins'), href: '/companies/admins' });
        developerItems.push({ icon: Webhook, label: t('companyApis'), href: '/companies/apis' });
        developerItems.push({ icon: Link2, label: t('linkApp'), href: '/companies/link' });
        developerItems.push({ icon: Users, label: t('users'), href: '/users' });
        developerItems.push({ icon: Package, label: t('packs'), href: '/packs' });
        developerItems.push({ icon: Globe, label: t('references'), href: '/references' });
        developerItems.push({ icon: Mail, label: t('newsletters'), href: '/newsletters' });
        developerItems.push({ icon: MessageCircle, label: t('chatSessions'), href: '/chat-sessions' });
        developerItems.push({ icon: Sparkles, label: t('aiTokens'), href: '/ai-tokens' });
    }

    const systemItems = [
        { icon: LogOut, label: tc('logout'), href: '/auth/logout' },
    ];

    const NavItem = ({ item, index }: { item: { icon: any; label: string; href: string }, index: number }) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
            <motion.div initial={{ x: isRtl ? 20 : -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: index * 0.04 }}>
                <Link
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-4 px-4 py-2.5 rounded-xl transition-all duration-200 relative group ${isActive ? 'bg-white/10 text-white shadow-lg' : 'text-white/50 hover:bg-white/5 hover:text-white'
                        }`}
                >
                    <item.icon size={20} className={isActive ? 'text-blue-400' : 'group-hover:text-blue-400 transition-colors'} />
                    <span className="font-medium text-sm tracking-normal">{item.label}</span>
                    {isActive && (
                        <motion.div layoutId="active-pill" className="ms-auto">
                            <ChevronRight size={14} className="text-blue-400 rtl:rotate-180" />
                        </motion.div>
                    )}
                </Link>
            </motion.div>
        );
    };

    const SectionHeader = ({ label }: { label: string }) => (
        <p className="px-5 mt-5 mb-2 text-[10px] uppercase font-bold text-white/30">{label}</p>
    );

    let idx = 0;

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
                    />
                )}
            </AnimatePresence>

            <aside className={cn(
                "w-72 h-screen bg-[#002B5B] text-white flex flex-col fixed inset-y-0 start-0 z-50 border-e border-white/5 transition-all duration-300",
                isOpen 
                    ? "translate-x-0" 
                    : isRtl ? "translate-x-full" : "-translate-x-full",
                "lg:translate-x-0"
            )}>
                <div className="px-6 py-5 flex items-center justify-between gap-4">
                    <div className="flex items-center">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                        >
                            <Image
                                src="/AxiaMeetings.svg"
                                alt="Axia Meetings Logo"
                                width={160}
                                height={54}
                                className="h-10 w-auto"
                                style={{ filter: 'brightness(0) invert(1)' }}
                                priority
                            />
                        </motion.div>
                    </div>
                    <button onClick={onClose} className="lg:hidden p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto sidebar-scrollbar">
                    <SectionHeader label={tc('main')} />
                    {mainItems.map((item) => <NavItem key={item.href} item={item} index={idx++} />)}

                    {adminItems.length > 0 && (
                        <>
                            <SectionHeader label={tc('administration')} />
                            {adminItems.map((item) => <NavItem key={item.href} item={item} index={idx++} />)}
                        </>
                    )}

                    {developerItems.length > 0 && (
                        <>
                            <SectionHeader label={tc('developer')} />
                            {developerItems.map((item) => <NavItem key={item.href} item={item} index={idx++} />)}
                        </>
                    )}

                    <SectionHeader label={tc('system')} />
                    {systemItems.map((item) => <NavItem key={item.href} item={item} index={idx++} />)}
                </nav>

                {/* Support section removed per user request */}
            </aside>
        </>
    );
}
