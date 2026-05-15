'use client';

import { useState, useEffect } from 'react';
import { Timer, Check, X, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface VoteModalProps {
  description: string;
  duration: number; // seconds
  onVote: (vote: 'Oui' | 'Non' | 'Neutre') => void;
}

export function VoteModal({ description, duration, onVote }: VoteModalProps) {
  const t = useTranslations('VoteModal');
  const tl = useTranslations('LiveMeeting.agenda');
  const [timeLeft, setTimeLeft] = useState(duration);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      if (!voted) onVote('Neutre');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, voted, onVote]);

  const handleVote = (vote: 'Oui' | 'Non' | 'Neutre') => {
    setVoted(true);
    onVote(vote);
  };

  if (voted) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-white">
        <div className="bg-[#002B5B] p-6 text-white relative">
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full backdrop-blur-md">
            <Timer size={14} className="text-blue-400" />
            <span className="text-sm font-semibold tabular-nums">{timeLeft}s</span>
          </div>
          <h2 className="text-xl font-semibold mb-1">{t('title')}</h2>
          <p className="text-blue-100/60 text-sm">{t('question')}</p>
        </div>

        <div className="p-6">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl mb-6">
            <p className="text-slate-700 font-medium leading-relaxed text-sm">{description}</p>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <button 
              onClick={() => handleVote('Oui')}
              className="flex items-center justify-between p-4 bg-green-50 border border-green-100 rounded-xl hover:bg-green-100 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center shadow-lg shadow-green-500/10 group-hover:scale-105 transition-transform">
                  <Check size={20} />
                </div>
                <span className="font-semibold text-base text-green-900">{t('options.yes')}</span>
              </div>
              <span className="text-xs uppercase font-semibold text-green-600/50 tracking-wide">{tl('voteTypes.for')}</span>
            </button>

            <button 
              onClick={() => handleVote('Non')}
              className="flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center shadow-lg shadow-red-500/10 group-hover:scale-105 transition-transform">
                  <X size={20} />
                </div>
                <span className="font-semibold text-base text-red-900">{t('options.no')}</span>
              </div>
              <span className="text-xs uppercase font-semibold text-red-600/50 tracking-wide">{tl('voteTypes.against')}</span>
            </button>

            <button 
              onClick={() => handleVote('Neutre')}
              className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-400 text-white rounded-lg flex items-center justify-center shadow-lg shadow-slate-400/10 group-hover:scale-105 transition-transform">
                  <Minus size={20} />
                </div>
                <span className="font-semibold text-base text-slate-900">{t('options.neutral')}</span>
              </div>
              <span className="text-xs uppercase font-semibold text-slate-400/50 tracking-wide">{tl('voteTypes.neutral')}</span>
            </button>
          </div>

          <p className="mt-5 text-xs text-center text-slate-400 italic">
            {t('disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}

