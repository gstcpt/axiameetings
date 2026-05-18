"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ChevronUp, 
    Languages, 
    MessageCircle, 
    X, 
    Bot, 
    User, 
    Loader2, 
    Minimize2, 
    Send,
    Check,
    Sun,
    Moon
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { locales, Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const names: Record<Locale, string> = {
    en: "EN",
    fr: "FR",
    ar: "AR"
};

const flags: Record<Locale, string> = {
    en: "🇺🇸",
    fr: "🇫🇷",
    ar: "🇹🇳"
};

export function CornerControls() {
    const locale = useLocale() as Locale;
    const tChat = useTranslations('Chat');
    const tCommon = useTranslations('Common');
    const pathname = usePathname();
    const isRTL = locale === 'ar';

    // --- Scroll To Top Logic ---
    const [isScrollVisible, setIsScrollVisible] = useState(false);
    useEffect(() => {
        const toggleVisibility = () => {
            setIsScrollVisible(window.scrollY > 300);
        };
        window.addEventListener("scroll", toggleVisibility);
        return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // --- Theme Toggle Logic ---
    const { theme, toggleTheme } = useTheme();

    // --- Language Toggle Logic ---
    const [isLangOpen, setIsLangOpen] = useState(false);
    const switchLanguage = (newLocale: Locale) => {
        if (newLocale === locale) {
            setIsLangOpen(false);
            return;
        }
        document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
        window.location.reload();
    };

    // --- Chat Logic ---
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isChatMinimized, setIsChatMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const sessionId = useRef<string>(
        typeof crypto !== 'undefined'
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2)
    );
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isChatOpen && !isChatMinimized) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isChatOpen, isChatMinimized]);

    useEffect(() => {
        if (isChatOpen && messages.length === 0) {
            setMessages([
                { role: 'assistant', content: tChat('welcome') },
                { role: 'assistant', content: tChat('privacyNotice') },
            ]);
        }
    }, [isChatOpen]);

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMessage: Message = { role: 'user', content: text };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    locale,
                    sessionId: sessionId.current,
                }),
            });

            if (!res.ok || !res.body) throw new Error('Failed');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'assistant', content: accumulated };
                    return updated;
                });
            }
        } catch {
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: tChat('error') };
                return updated;
            });
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages, locale, tChat]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div 
            className={cn(
                "fixed bottom-6 z-[100] flex flex-col items-end gap-3",
                isRTL ? "left-6" : "right-6"
            )}
            dir={isRTL ? 'rtl' : 'ltr'}
        >
            {/* Chat Panel */}
            <AnimatePresence>
                {isChatOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: isRTL ? -20 : 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: isRTL ? -20 : 20, scale: 0.95 }}
                        className={cn(
                            "fixed sm:absolute bottom-0 w-[calc(100vw-32px)] sm:w-[400px] bg-white rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden flex flex-col z-10",
                            isRTL ? "left-4 sm:left-20 bottom-24 sm:bottom-0" : "right-4 sm:right-20 bottom-24 sm:bottom-0"
                        )}
                        style={{ maxHeight: isChatMinimized ? '72px' : 'calc(100vh - 120px)', height: '80vh' }}
                    >
                        <div className="flex items-center justify-between px-8 py-6 bg-[#002B5B] text-white shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-[1.25rem] bg-white/10 flex items-center justify-center backdrop-blur-md">
                                    <Bot className="w-6 h-6 text-blue-300" />
                                </div>
                                <div>
                                    <p className="text-lg font-black uppercase tracking-widest">{tChat('title')}</p>
                                    <p className="text-sm text-blue-200 font-black uppercase tracking-[0.2em] opacity-70">{tChat('subtitle')}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsChatMinimized(!isChatMinimized)} className="p-2.5 rounded-2xl hover:bg-white/10 transition-colors">
                                    <Minimize2 className="w-5 h-5" />
                                </button>
                                <button onClick={() => setIsChatOpen(false)} className="p-2.5 rounded-2xl hover:bg-white/10 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {!isChatMinimized && (
                            <>
                                <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50 custom-scrollbar">
                                    {messages.map((msg, i) => (
                                        <div key={i} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                                            <div className={cn(
                                                "w-10 h-10 rounded-[1rem] shrink-0 flex items-center justify-center text-white shadow-lg",
                                                msg.role === 'assistant' ? "bg-[#002B5B]" : "bg-blue-600"
                                            )}>
                                                {msg.role === 'assistant' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                                            </div>
                                            <div className={cn(
                                                "max-w-[85%] rounded-[1.5rem] px-6 py-4 text-base font-bold leading-relaxed shadow-sm",
                                                msg.role === 'assistant' ? "bg-white text-slate-700 border border-slate-100" : "bg-blue-600 text-white"
                                            )}>
                                                {msg.content === '' && loading && i === messages.length - 1 ? (
                                                    <div className="flex gap-1.5 items-center py-2">
                                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </div>
                                                ) : (
                                                    <span className="whitespace-pre-wrap">{msg.content}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="p-6 bg-white border-t border-slate-100">
                                    <div className="flex gap-2 bg-slate-50 p-2 rounded-[2rem] border border-slate-100 focus-within:border-blue-400 focus-within:ring-8 focus-within:ring-blue-400/5 transition-all">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder={tChat('placeholder')}
                                            disabled={loading}
                                            className="flex-1 bg-transparent px-5 py-3 outline-none text-base font-bold text-[#002B5B] placeholder:text-slate-400"
                                        />
                                        <button
                                            onClick={sendMessage}
                                            disabled={loading || !input.trim()}
                                            className="w-12 h-12 rounded-full bg-[#002B5B] text-white flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/20"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    <p className="text-sm text-center font-black uppercase tracking-[0.2em] text-slate-300 mt-4">{tChat('poweredBy')}</p>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Controls Stack */}
            <div className="flex flex-col gap-3">
                {/* 1. Chatbot Button */}
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setIsChatOpen(!isChatOpen); setIsChatMinimized(false); }}
                    className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border relative",
                        isChatOpen 
                            ? "bg-white border-slate-100 text-[#002B5B]" 
                            : "bg-[#002B5B] border-white/10 text-white"
                    )}
                >
                    {isChatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
                    {!isChatOpen && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />}
                </motion.button>

                {/* 2. Language Toggle (Horizontal) */}
                <div className="relative flex items-center">
                    <AnimatePresence>
                        {isLangOpen && (
                            <motion.div
                                initial={{ opacity: 0, x: isRTL ? 20 : -20, scale: 0.8 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: isRTL ? 20 : -20, scale: 0.8 }}
                                className={cn(
                                    "absolute flex gap-2 p-2 bg-white/90 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-2xl",
                                    isRTL ? "left-16" : "right-16"
                                )}
                            >
                                {locales.map((l) => (
                                    <button
                                        key={l}
                                        onClick={() => switchLanguage(l)}
                                        className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center text-sm transition-all font-black uppercase tracking-widest",
                                            locale === l ? "bg-[#002B5B] text-white" : "hover:bg-slate-100 text-slate-600"
                                        )}
                                    >
                                        {names[l]}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsLangOpen(!isLangOpen)}
                        className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border bg-white text-[#002B5B] border-slate-100"
                        )}
                    >
                        <Languages className="w-6 h-6" />
                    </motion.button>
                </div>

                {/* 3. Theme Toggle Button */}
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleTheme}
                    aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border bg-white dark:bg-slate-800 text-[#002B5B] dark:text-yellow-400 border-slate-100 dark:border-slate-700"
                >
                    {theme === "dark" ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
                </motion.button>

                {/* 4. Scroll To Top Button */}
                <AnimatePresence>
                    {isScrollVisible && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={scrollToTop}
                            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border bg-white text-[#002B5B] border-slate-100"
                        >
                            <ChevronUp className="w-6 h-6" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
