'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Newsletter, ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Mail, Trash2, Download, Send, LayoutGrid, List } from 'lucide-react';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { ConfirmModal } from '@/components/ui/modals';
import { cn } from '@/lib/utils';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/cards';

export default function NewslettersPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('Newsletters');
    const tc = useTranslations('Common');
    const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<Newsletter | null>(null);
    const [bulkSelected, setBulkSelected] = useState<Newsletter[]>([]);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchNewsletters = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/newsletters');
            const result: ApiResponse<Newsletter[]> = await res.json();
            if (result.status && result.data) setNewsletters(result.data);
            else toast.error(result.message || t('toast.fetchError'));
        } catch { toast.error(t('toast.fetchError')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (user?.role === UserRole.DEVELOPER) fetchNewsletters(); }, [user]);

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/newsletters?id=${selected.id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.status) { toast.success(t('toast.removed')); fetchNewsletters(); }
            else toast.error(result.message || t('toast.deleteError'));
        } catch { toast.error(t('toast.deleteError')); }
        finally { setSaving(false); setConfirmDelete(false); setSelected(null); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.all(bulkSelected.map(n => fetch(`/api/newsletters?id=${n.id}`, { method: 'DELETE' })));
            toast.success(t('toast.bulkRemoved', { count: bulkSelected.length }));
            fetchNewsletters(); setBulkSelected([]);
        } catch { toast.error(t('toast.deleteError')); }
        finally { setSaving(false); setConfirmBulk(false); }
    };

    const exportCSV = () => {
        const csv = [`${t('table.email')},${t('table.subscribedAt')}`, ...newsletters.map(n => `${n.email},${new Date(n.created_at).toLocaleDateString()}`)].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = t('csvFilename'); a.click();
    };

    const columns: Column<Newsletter>[] = [
        {
            accessorKey: 'email',
            header: t('table.email'),
            cell: ({ row }) => (
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <Mail size={12} className="text-[#002B5B]" />
                    </div>
                    <Typography variant="large" className="text-slate-900 font-bold text-xs">{row.original.email}</Typography>
                </div>
            ),
        },
        {
            accessorKey: 'created_at',
            header: t('table.subscribedAt'),
            cell: ({ row }) => (
                <Typography variant="p" className="text-slate-500 font-bold text-[11px] uppercase">
                    {new Date(row.original.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                </Typography>
            ),
        },
        {
            id: 'actions',
            header: t('table.actions'),
            enableSorting: false,
            cell: ({ row }) => (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setSelected(row.original); setConfirmDelete(true); }}
                    className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                    <Trash2 size={14} />
                </Button>
            ),
        },
    ];

    const bulkActions: BulkAction<Newsletter>[] = [{
        label: tc('delete'), icon: <Trash2 size={14} />, variant: 'danger',
        onClick: (rows) => { setBulkSelected(rows); setConfirmBulk(true); },
    }];

    if (authLoading || isLoading) return (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
            <Typography variant="label">{tc('loading')}</Typography>
        </div>
    );

    return (
        <div className="space-y-8 pb-20">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 md:w-80 h-64 md:h-80 bg-blue-50/50 rounded-full blur-[80px] md:blur-[100px] -translate-y-1/2 translate-x-1/2 -z-10"></div>

                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Send size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle', { count: newsletters.length })}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex bg-slate-50 p-0.5 rounded-lg border border-slate-100">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={cn(
                                    "flex-1 md:flex-none flex items-center justify-center gap-2 h-8 px-3 rounded-md transition-all font-semibold text-[10px] uppercase",
                                    viewMode === 'grid' ? "bg-white text-[#002B5B] shadow-sm" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                <LayoutGrid size={12} /> <span className="hidden md:inline">{tc('table.viewGrid')}</span>
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={cn(
                                    "flex-1 md:flex-none flex items-center justify-center gap-2 h-8 px-3 rounded-md transition-all font-semibold text-[10px] uppercase",
                                    viewMode === 'list' ? "bg-white text-[#002B5B] shadow-sm" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                <List size={12} /> <span className="hidden md:inline">{tc('table.viewList')}</span>
                            </button>
                        </div>
                        <Button
                            onClick={exportCSV}
                            className="w-full md:w-auto h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm"
                        >
                            <Download size={18} className="me-2" /> {t('exportCsv')}
                        </Button>
                    </div>
                </div>
            </div>

            <Card className="rounded-2xl border-slate-200 overflow-hidden">
                <DataTable
                    columns={columns}
                    data={newsletters}
                    searchable
                    searchPlaceholder={t('searchPlaceholder')}
                    bulkActions={bulkActions}
                    emptyMessage={t('emptyMessage')}
                    pagesize={10}
                    viewMode={viewMode}
                />
            </Card>

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={handleDelete}
                title={t('delete.title')}
                description={t('delete.description', { email: selected?.email || '' })}
                confirmLabel={t('delete.confirm')}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />

            <ConfirmModal
                isOpen={confirmBulk}
                onClose={() => setConfirmBulk(false)}
                onConfirm={handleBulkDelete}
                title={t('bulkDelete.title', { count: bulkSelected.length })}
                description={t('bulkDelete.description', { count: bulkSelected.length })}
                confirmLabel={t('bulkDelete.confirm', { count: bulkSelected.length })}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />
        </div>
    );
}
