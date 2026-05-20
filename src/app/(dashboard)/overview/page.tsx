'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, Users, Video, CalendarClock, PieChart as PieChartIcon, Activity, Database, ShieldCheck, ScrollText, TrendingUp, ArrowUpRight, Plus, Calendar, Clock, ChevronRight, Sparkles, Ban } from 'lucide-react';
import { OverviewStats, ApiResponse } from '@/lib/types';
import { toast } from 'sonner';
import { motion, animate, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/context/AuthContext';
import Link from 'next/link';

import { useTranslations, useLocale } from 'next-intl';
import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badges';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import AreaChartComponent from '@/components/ui/charts/areas';
import BarChartComponent from '@/components/ui/charts/bars';
import PieChartComponent from '@/components/ui/charts/pies';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = { SCHEDULED: '#3b82f6', STARTED: '#22c55e', FINISHED: '#64748b', CANCELLED: '#ef4444' };
const PIE_COLORS = ["#002B5B", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

function AnimatedCounter({ value }: { value: number }) {
    const nodeRef = useRef<HTMLParagraphElement>(null);
    useEffect(() => {
        const node = nodeRef.current;
        if (node) {
            const controls = animate(0, value, {
                duration: 1.5,
                ease: [0.33, 1, 0.68, 1], // Custom cubic bezier for premium feel
                onUpdate(v) {
                    node.textContent = Math.round(v).toLocaleString();
                }
            });
            return () => controls.stop();
        }
    }, [value]);
    return <Typography variant="h1" as="p" ref={nodeRef} className="text-xl md:text-2xl font-semibold leading-none tabular-nums">{value.toLocaleString()}</Typography>;
}

const MiniCalendar = ({ meetingDates = [] }: { meetingDates?: string[] }) => {
    const t = useTranslations('Dashboard.overview');
    const locale = useLocale();
    const today = new Date();
    const currentMonth = today.toLocaleString(locale === 'ar' ? 'ar-TN' : locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();

    const meetingDays = new Set(
        meetingDates
            .filter(d => d.startsWith(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`))
            .map(d => parseInt(d.split('-')[2], 10))
    );

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const weekDays = t.raw('calendar.days');

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col h-full group hover:shadow-2xl hover:shadow-blue-900/5 dark:hover:shadow-black/20 transition-all duration-500"
        >
            <div className="flex items-center justify-between mb-4">
                <div>
                    <Typography variant="label" className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">{t('header.outlook')}</Typography>
                    <Typography variant="h3" className="text-sm font-semibold">{currentMonth}</Typography>
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#002B5B] flex items-center justify-center shadow-sm border border-blue-100/50">
                    <Calendar size={14} />
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-300 mb-6">
                {weekDays.map((d: string) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs flex-1 content-start">
                {days.map((d, i) => (
                    <div
                        key={i}
                        className={cn(
                            "p-1.5 rounded-lg flex flex-col items-center justify-center relative transition-all duration-300 h-8",
                            !d ? 'opacity-0' :
                                d === today.getDate() ? 'bg-[#002B5B] text-white font-semibold shadow-xl shadow-blue-900/10 z-10' :
                                    'text-slate-600 dark:text-slate-350 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-default'
                        )}
                    >
                        {d || ''}
                        {d && meetingDays.has(d) && (
                            <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className={cn(
                                    "w-1 h-1 rounded-full absolute bottom-1",
                                    d === today.getDate() ? "bg-white" : "bg-blue-500"
                                )}
                            />
                        )}
                    </div>
                ))}
            </div>
        </motion.div>
    );
};

export default function OverviewPage() {
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [loading, setLoading] = useState(true);
    const t = useTranslations('Dashboard.overview');
    const ts = useTranslations('Dashboard.sidebar');
    const tc = useTranslations('Common');
    const { user } = useAuth();
    const locale = useLocale();
    const isDeveloper = user?.role === 'DEVELOPER';

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/overview');
                const result: ApiResponse<OverviewStats> = await res.json();
                if (result.status && result.data) {
                    setStats(result.data);
                } else {
                    toast.error(result.message || tc('error'));
                }
            } catch {
                toast.error(tc('error'));
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [tc]);

    const statCards = [
        ...(isDeveloper ? [{ title: ts('companies'), value: stats?.companies ?? 0, icon: Building2, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-100 dark:border-blue-900/30', href: '/companies' }] : []),
        { title: t('stats.apis'), value: stats?.apis ?? 0, icon: Database, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/20', border: 'border-cyan-100 dark:border-cyan-900/30', href: '/companies/apis' },
        { title: t('stats.admins'), value: stats?.admins ?? 0, icon: ShieldCheck, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-100 dark:border-emerald-900/30', href: '/companies/admins' },
        { title: ts('users'), value: stats?.users ?? 0, icon: Users, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/20', border: 'border-purple-100 dark:border-purple-900/30', href: '/users' },
        { title: ts('meetings'), value: stats?.meetings ?? 0, icon: Video, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/20', border: 'border-rose-100 dark:border-rose-900/30', href: '/meetings' },
        { title: t('stats.cancelled'), value: stats?.meetingsByStatus?.CANCELLED ?? 0, icon: Ban, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-100 dark:border-red-900/30', href: '/meetings' },
        { title: ts('logs'), value: stats?.logs ?? 0, icon: ScrollText, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-100 dark:border-amber-900/30', href: '/logs' },
    ];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
                <div className="w-16 h-16 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                <Typography variant="label" className="animate-pulse">{tc('loading')}</Typography>
            </div>
        );
    }

    const formatPieData = (data: Record<string, number> | undefined) => {
        if (!data) return [];
        return Object.entries(data).filter(([_, value]) => value > 0).map(([name, value]) => ({ name, value }));
    };

    const statusData = formatPieData(stats?.meetingsByStatus);
    const typeData = formatPieData(stats?.meetingsByType);
    const usersRoleData = formatPieData(stats?.usersByRole);

    return (
        <div className="space-y-8 md:space-y-12 pb-20">
            {/* Premium Welcome Header */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm shadow-blue-900/5 dark:shadow-black/20 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Sparkles size={20} className="md:w-6 md:h-6 text-blue-200" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-center sm:justify-start gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-slate-200" />
                                <Typography variant="label" className="text-slate-500 font-bold uppercase text-[8px]">{new Date().toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</Typography>
                            </div>
                            <div className="space-y-0.5">
                                <Typography variant="h2" className="text-[#002B5B] dark:text-white text-xl font-bold leading-tight">
                                    {t('title')}
                                </Typography>
                                <Typography variant="p" color="secondary" className="max-w-xl text-[11px] font-bold uppercase">
                                    {t('welcome', { name: user?.fullname || user?.username || '' })}
                                </Typography>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <Link href="/meetings" className="w-full">
                            <Button className="w-full md:w-auto h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm">
                                <Plus size={18} className="me-2" /> {t('stats.createMeeting')}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Stats Ecosystem */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:col-span-3">
                    {statCards.map((stat, i) => (
                        <Link key={i} href={stat.href} className="block group">
                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                                className={cn(
                                    "bg-white dark:bg-slate-900 rounded-2xl p-4 border shadow-sm h-full transition-all duration-500 flex flex-col justify-between relative overflow-hidden group-hover:shadow-2xl group-hover:shadow-blue-900/10 dark:group-hover:shadow-black/20 group-hover:-translate-y-1",
                                    stat.border
                                )}
                            >
                                <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-slate-50/50 dark:bg-slate-800/10 rounded-full blur-2xl group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/20 transition-colors duration-500" />
                                <div className="flex items-center justify-between mb-4 relative z-10">
                                    <Typography variant="label" className="text-[12px] font-bold uppercase text-slate-400 group-hover:text-[#002B5B] transition-colors">{stat.title}</Typography>
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-sm border border-current/10 transition-transform duration-500 group-hover:scale-110", stat.bg, stat.color)}>
                                        <stat.icon size={14} />
                                    </div>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-2">
                                    <AnimatedCounter value={stat.value} />
                                    <div className="flex items-center text-emerald-500 text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900/30">
                                        <ArrowUpRight size={10} className="me-1" />
                                        {t('stats.live')}
                                    </div>
                                </div>
                            </motion.div>
                        </Link>
                    ))}
                </div>
                <div className="flex flex-col gap-8 lg:col-span-1">
                    <MiniCalendar meetingDates={stats?.meetingDates} />
                </div>
            </div>

            {/* Analytics Landscape */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Main Trend Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 lg:col-span-8 group hover:shadow-2xl hover:shadow-blue-900/5 dark:hover:shadow-black/20 transition-all duration-500"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-slate-800 text-[#002B5B] dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-slate-700">
                                <TrendingUp size={14} />
                            </div>
                            <div>
                                <Typography variant="h3" className="text-sm font-semibold">{t('charts.volumeTitle')}</Typography>
                                <Typography variant="label" className="text-[9px] uppercase font-semibold text-slate-400">{t('charts.volumeSubtitle', { item: ts('meetings') })}</Typography>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div className="h-2 w-2 rounded-full bg-[#002B5B]" />
                            <div className="h-2 w-2 rounded-full bg-slate-100 dark:bg-slate-800" />
                        </div>
                    </div>
                    <BarChartComponent
                        data={stats?.trendData || []}
                        xKey="name"
                        series={[{ key: 'meetings', name: ts('meetings'), color: '#002B5B' }]}
                        height={400}
                    />
                </motion.div>

                {/* Status Distribution */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 lg:col-span-4 flex flex-col group hover:shadow-2xl hover:shadow-blue-900/5 dark:hover:shadow-black/20 transition-all duration-500"
                >
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-900/30">
                            <PieChartIcon size={14} />
                        </div>
                        <div>
                            <Typography variant="h3" className="text-sm font-semibold">{t('charts.statusMix')}</Typography>
                            <Typography variant="label" className="text-[9px] uppercase font-semibold text-slate-400">{t('charts.statusMixSubtitle')}</Typography>
                        </div>
                    </div>
                    <div className="grow flex items-center justify-center">
                        {statusData.length > 0 ? (
                            <PieChartComponent
                                data={statusData}
                                donut
                                colors={statusData.map(entry => STATUS_COLORS[entry.name] || PIE_COLORS[0])}
                                height={320}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-slate-300 opacity-20 py-20">
                                <PieChartIcon size={64} className="mb-4" />
                                <Typography variant="label" className="uppercase font-bold">{t('charts.noStatusData')}</Typography>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Secondary Metrics Row */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 lg:col-span-4 group hover:shadow-2xl hover:shadow-blue-900/5 dark:hover:shadow-black/20 transition-all duration-500"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/30">
                            <Users size={14} />
                        </div>
                        <div>
                            <Typography variant="h3" className="text-sm font-semibold">{t('charts.roleComposition')}</Typography>
                            <Typography variant="label" className="text-[9px] uppercase font-semibold text-slate-400">{t('charts.roleCompositionSubtitle')}</Typography>
                        </div>
                    </div>
                    {usersRoleData.length > 0 ? (
                        <PieChartComponent
                            data={usersRoleData}
                            donut
                            colors={PIE_COLORS}
                            height={280}
                        />
                    ) : (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-100">
                            <Users size={48} />
                        </div>
                    )}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 lg:col-span-8 group hover:shadow-2xl hover:shadow-blue-900/5 dark:hover:shadow-black/20 transition-all duration-500"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-900/30">
                            <Activity size={14} />
                        </div>
                        <div>
                            <Typography variant="h3" className="text-sm font-semibold">{t('charts.systemActivity')}</Typography>
                            <Typography variant="label" className="text-[9px] uppercase font-semibold text-slate-400">{t('charts.systemActivitySubtitle')}</Typography>
                        </div>
                    </div>
                    <AreaChartComponent
                        data={stats?.logsActivity || []}
                        xKey="name"
                        series={[{ key: 'activity', name: ts('logs'), color: '#f59e0b' }]}
                        height={350}
                    />
                </motion.div>
            </div>
        </div>
    );
}

function ArrowRight({ className, size = 16 }: { className?: string, size?: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
    );
}
