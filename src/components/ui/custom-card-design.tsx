import React from 'react';
import { Row, flexRender } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { MoreVertical } from 'lucide-react';

export interface CustomCardDesignProps<TData> {
    row: Row<TData>;
}

export function CustomCardDesign<TData>({ row }: CustomCardDesignProps<TData>) {
    const t = useTranslations('Common.table');
    const cells = row.getVisibleCells();
    
    // Find special cells to position them differently
    const selectCell = cells.find(c => c.column.id === "__select__");
    const actionsCell = cells.find(c => c.column.id === "actions");
    
    // All other content cells
    const contentCells = cells.filter(c => c.column.id !== "__select__" && c.column.id !== "actions");

    // To make it look gorgeous and less "table-like", we can highlight the FIRST column as a title.
    const titleCell = contentCells.length > 0 ? contentCells[0] : null;
    const remainingCells = contentCells.slice(1);

    return (
        <motion.div
            whileHover={{ 
                y: -8,
                transition: { duration: 0.3, ease: "easeOut" }
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group relative bg-white/70 backdrop-blur-xl rounded-[2rem] p-8 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(0,43,91,0.1)] transition-all duration-500 flex flex-col h-full overflow-hidden",
                row.getIsSelected() && "border-[#002B5B]/30 bg-blue-50/20"
            )}
        >
            {/* Animated Glow Backdrop */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#002B5B]/5 rounded-full blur-[60px] group-hover:bg-[#002B5B]/10 transition-colors duration-500" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-400/5 rounded-full blur-[60px] group-hover:bg-blue-400/10 transition-colors duration-500" />
            
            {/* Top Accent Line */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#002B5B] via-blue-500 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="flex justify-between items-start mb-8 relative z-10">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                    {selectCell && (
                        <div className="pt-1.5 shrink-0 scale-110">
                            {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                        </div>
                    )}
                    {titleCell && (
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-black tracking-[0.2em] uppercase text-[#002B5B]/40">
                                    {typeof titleCell.column.columnDef.header === 'string' 
                                        ? titleCell.column.columnDef.header 
                                        : titleCell.column.id}
                                </span>
                                <div className="h-px flex-1 bg-slate-100/50" />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-[#002B5B] transition-colors duration-300 leading-tight truncate tracking-tight">
                                {flexRender(titleCell.column.columnDef.cell, titleCell.getContext())}
                            </h3>
                        </div>
                    )}
                </div>
                
                {actionsCell ? (
                    <div className="shrink-0 flex items-center justify-end bg-slate-50/50 rounded-2xl p-1 border border-slate-100 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                        {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                    </div>
                ) : (
                    <button className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all shrink-0 border border-transparent hover:border-slate-100">
                        <MoreVertical size={20} />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 relative z-10">
                {remainingCells.map((cell, idx) => (
                    <div key={cell.id} className="flex flex-col min-w-0 animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${idx * 50}ms` }}>
                        <div className="flex items-center gap-2.5 text-[9px] font-black tracking-widest uppercase text-slate-400/80 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-[#002B5B] to-blue-400 shadow-sm" />
                            {typeof cell.column.columnDef.header === 'string' 
                                ? cell.column.columnDef.header 
                                : cell.column.id}
                        </div>
                        <div className="text-sm font-bold text-slate-600 truncate leading-relaxed bg-slate-50/30 rounded-xl p-3 border border-slate-100/50 group-hover:bg-white/50 group-hover:border-white transition-all duration-300 shadow-xs">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Bottom Footer Design Element */}
            <div className="mt-8 pt-6 border-t border-slate-50/50 flex items-center justify-between relative z-10">
                <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-100" />
                    ))}
                </div>
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">
                    Axia Meeting Intelligence
                </div>
            </div>
        </motion.div>
    );
}

