'use client';

import { Calendar, MapPin, Video, Play, MoreVertical, Info, Clock, Users, ChevronRight, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { Meeting } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface MeetingCardProps {
  meeting: Meeting & {
    meetings_participants?: any[];
    meetings_attendances?: any[];
  };
}

export function MeetingCard({ meeting }: MeetingCardProps) {
  const t = useTranslations('Meetings');
  const tc = useTranslations('Common');

  const statusConfig: Record<string, { variant: "primary" | "success" | "secondary" | "danger"; label: string; glow: string }> = {
    'SCHEDULED': { variant: 'primary', label: t('status.scheduled'), glow: 'group-hover:shadow-blue-500/20' },
    'STARTED': { variant: 'success', label: t('status.started'), glow: 'group-hover:shadow-emerald-500/20' },
    'FINISHED': { variant: 'secondary', label: t('status.finished'), glow: 'group-hover:shadow-slate-500/20' },
    'CANCELLED': { variant: 'danger', label: t('status.cancelled'), glow: 'group-hover:shadow-red-500/20' },
  };

  const statusLabel = meeting.status || 'SCHEDULED';
  const config = statusConfig[statusLabel] || statusConfig['SCHEDULED'];

  const nbr_invi = meeting.meetings_participants?.length || 0;
  const nbr_accept = meeting.meetings_attendances?.length || 0;
  const participation = nbr_invi > 0 ? Math.round((nbr_accept / nbr_invi) * 100) : 0;

  const meetingType = meeting.type || 'ORDINAIRE';
  const localizedType = t(`types.${meetingType.toLowerCase()}`);

  return (
    <motion.div
      whileHover={{ y: -8, transition: { duration: 0.3, ease: "easeOut" } }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(0,43,91,0.12)] transition-all duration-500 flex flex-col h-full overflow-hidden",
        config.glow
      )}
    >
      {/* Dynamic Background Accents */}
      <div className={cn(
        "absolute -top-24 -right-24 w-56 h-56 rounded-full blur-[70px] opacity-10 transition-colors duration-700",
        statusLabel === 'STARTED' ? "bg-emerald-500" : "bg-blue-500"
      )} />
      <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-indigo-500/5 rounded-full blur-[70px]" />
      
      {/* Top Gradient Stripe */}
      <div className={cn(
        "absolute top-0 inset-x-0 h-2 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        statusLabel === 'STARTED' ? "from-emerald-400 via-teal-500 to-cyan-400" : "from-[#002B5B] via-blue-500 to-indigo-400"
      )} />

      {/* Header Info */}
      <div className="flex justify-between items-start mb-8 relative z-10">
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <Badge variant={config.variant} className="w-fit h-6 px-3 text-[9px] uppercase font-black tracking-widest shadow-sm">
            {config.label}
          </Badge>
          <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-[#002B5B] transition-colors duration-300 leading-tight tracking-tight min-h-[3rem]" title={meeting.subject}>
            {meeting.subject}
          </h3>
        </div>
        <button className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-2xl text-slate-300 hover:text-slate-900 transition-all shrink-0 border border-transparent hover:border-slate-100">
          <MoreVertical size={20} />
        </button>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-4 mb-8 relative z-10">
        {[
          { icon: Calendar, text: meeting.date, label: tc('date'), color: 'text-blue-500' },
          { icon: Clock, text: meeting.time, label: t('card.time'), color: 'text-amber-500' },
          { icon: MapPin, text: meeting.location || tc('notAvailable'), label: t('card.location'), color: 'text-emerald-500' },
          { icon: Activity, text: localizedType, label: t('form.type'), color: 'text-indigo-500' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50 group-hover:bg-white/80 group-hover:border-white transition-all duration-300">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-white shadow-sm shrink-0", item.color)}>
              <item.icon size={16} />
            </div>
            <div className="min-w-0">
              <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block mb-0.5">{item.label}</span>
              <span className="text-xs font-bold text-slate-700 truncate block">{item.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Participation Progress */}
      <div className="space-y-3 mb-8 relative z-10 px-1">
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-[#002B5B]/40" />
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">{t('participation')}</span>
          </div>
          <span className="text-lg font-black text-[#002B5B] tracking-tighter">{participation}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-100/50 rounded-full overflow-hidden p-0.5 border border-slate-100">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${participation}%` }}
            transition={{ duration: 1.2, ease: "circOut" }}
            className={cn(
              "h-full rounded-full shadow-sm",
              statusLabel === 'STARTED' ? "bg-gradient-to-r from-emerald-400 to-teal-500" : "bg-gradient-to-r from-[#002B5B] to-blue-500"
            )}
          />
        </div>
        <div className="flex justify-between text-[8px] font-bold text-slate-300 uppercase">
          <span>{nbr_accept} {tc('accepted')}</span>
          <span>{nbr_invi} {tc('invited')}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 relative z-10 mt-auto">
        <Link href={`/meetings/${meeting.id}/live`} className="flex-[1.5]">
          <Button className={cn(
            "w-full h-12 rounded-[1.25rem] font-bold text-xs uppercase tracking-widest transition-all duration-300 shadow-lg active:scale-95 group/btn overflow-hidden relative",
            statusLabel === 'STARTED' 
              ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" 
              : "bg-[#002B5B] hover:bg-[#003d80] shadow-blue-900/20"
          )}>
            <div className="absolute inset-0 bg-linear-to-r from-white/10 to-transparent opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            <div className="flex items-center justify-center gap-2 relative z-10">
              {statusLabel === 'STARTED' ? <Play size={14} fill="currentColor" className="animate-pulse" /> : <Video size={14} />}
              {statusLabel === 'STARTED' ? t('card.join') : t('card.start')}
            </div>
          </Button>
        </Link>
        <Link href={`/meetings/${meeting.id}`} className="flex-1">
          <Button variant="outline" className="w-full h-12 rounded-[1.25rem] border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 text-slate-500">
            {t('card.details')}
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
