import React from 'react';
import { Row, flexRender } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface UserAdminCardProps<TData> {
    row: Row<TData>;
}

export function UserAdminCard<TData>({ row }: UserAdminCardProps<TData>) {
    const t = useTranslations('Common.table');
    const cells = row.getVisibleCells();
    const originalData = row.original as any;
    
    // Find special cells
    const selectCell = cells.find(c => c.column.id === "__select__");
    const actionsCell = cells.find(c => c.column.id === "actions");
    
    const contentCells = cells.filter(c => c.column.id !== "__select__" && c.column.id !== "actions");

    // Try to guess Name, Email, Phone, Role cells by id or just fall back to standard mapping
    const nameCell = contentCells.find(c => c.column.id.toLowerCase().includes('name')) || contentCells[0];
    const emailCell = contentCells.find(c => c.column.id.toLowerCase().includes('email'));
    const phoneCell = contentCells.find(c => c.column.id.toLowerCase().includes('phone'));
    const roleCell = contentCells.find(c => c.column.id.toLowerCase().includes('role'));
    
    // Any remaining cells that we didn't specifically highlight
    const highlightedIds = [nameCell?.id, emailCell?.id, phoneCell?.id, roleCell?.id].filter(Boolean);
    const remainingCells = contentCells.filter(c => !highlightedIds.includes(c.id));

    // Fallback info from original data if cells are not strictly matched
    const avatarUrl = originalData?.image_url || originalData?.avatar;
    const fallbackName = originalData?.name || originalData?.first_name || '';
    
    return (
        <motion.div
            whileHover={{ y: -4 }}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-300 flex flex-col h-full overflow-hidden",
                row.getIsSelected() && "border-blue-500/50 ring-2 ring-blue-500/20"
            )}
        >
            <div className="p-6 pb-0 flex items-start justify-between relative">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <User size={20} className="text-slate-400" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                            {nameCell ? flexRender(nameCell.column.columnDef.cell, nameCell.getContext()) : fallbackName}
                        </h3>
                        {roleCell && (
                            <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                                <Shield size={12} />
                                {flexRender(roleCell.column.columnDef.cell, roleCell.getContext())}
                            </div>
                        )}
                    </div>
                </div>
                
                {selectCell && (
                    <div className="mt-1">
                        {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                    </div>
                )}
            </div>

            <div className="px-6 py-5 mt-4 border-t border-slate-100 dark:border-slate-800 flex-1 space-y-4">
                {emailCell && (
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{emailCell.column.columnDef.header as string || 'Email'}</span>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <Mail size={14} className="text-slate-400" />
                            {flexRender(emailCell.column.columnDef.cell, emailCell.getContext())}
                        </div>
                    </div>
                )}
                {phoneCell && (
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{phoneCell.column.columnDef.header as string || 'Phone'}</span>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <Phone size={14} className="text-slate-400" />
                            {flexRender(phoneCell.column.columnDef.cell, phoneCell.getContext())}
                        </div>
                    </div>
                )}
                
                {remainingCells.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        {remainingCells.map(cell => (
                            <div key={cell.id} className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">
                                    {typeof cell.column.columnDef.header === 'string' ? cell.column.columnDef.header : cell.column.id}
                                </span>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Bottom Actions */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end w-full">
                {actionsCell ? (
                    <div className="flex gap-2 w-full justify-end [&>*]:w-full [&>button]:w-full [&_button]:w-full [&_.flex]:w-full [&_button]:bg-white dark:[&_button]:bg-slate-800 [&_button]:border [&_button]:border-slate-200 dark:[&_button]:border-slate-700 [&_button:hover]:bg-slate-100 dark:[&_button:hover]:bg-slate-700 [&_button]:text-slate-700 dark:[&_button]:text-slate-200 [&_button]:shadow-sm">
                        {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                    </div>
                ) : (
                    <button className="w-full h-10 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-bold text-xs uppercase tracking-wider shadow-sm">
                        {t('selectRow')}
                    </button>
                )}
            </div>
        </motion.div>
    );
}
