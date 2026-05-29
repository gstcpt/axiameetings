"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2, Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface ChatWidgetProps {
    /** Pass meetingId when rendering inside a live meeting page */
    meetingId?: number;
}

export function ChatWidget({ meetingId }: ChatWidgetProps) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [minimized, setMinimized] = useState(false);
    // UUID generated once per widget mount — one row per browser session
    const sessionId = useRef<string>(typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const locale = useLocale();
    const t = useTranslations("Chat");
    const pathname = usePathname();
    const isRTL = locale === "ar";

    // Auto-detect meetingId from URL if not passed as prop
    const resolvedMeetingId =
        meetingId ??
        (() => {
            const match = pathname.match(/\/meetings\/(\d+)\/live/);
            return match ? Number(match[1]) : undefined;
        })();

    // Mark session closed on page unload
    useEffect(() => {
        const handleUnload = () => {
            navigator.sendBeacon(
                "/api/chat",
                new Blob([JSON.stringify({ _close: true, sessionId: sessionId.current })], { type: "application/json" })
            );
        };
        window.addEventListener("beforeunload", handleUnload);
        return () => window.removeEventListener("beforeunload", handleUnload);
    }, []);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (open && !minimized) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open, minimized]);

    // Add welcome message on first open
    useEffect(() => {
        if (open && messages.length === 0) {
            setMessages([
                {
                    role: "assistant",
                    content: t("welcome"),
                },
                {
                    role: "assistant",
                    content: t("privacyNotice"),
                },
            ]);
        }
    }, [open]);

    const downloadChat = useCallback(() => {
        if (messages.length === 0) return;
        
        let textContent = "Axia Meetings - Chat Export\n\n";
        messages.forEach(msg => {
            const role = msg.role === "user" ? "You" : "Axia Support";
            textContent += `[${role}]: \n${msg.content}\n\n`;
        });
        
        const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `chat-export-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [messages]);

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMessage: Message = { role: "user", content: text };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setLoading(true);

        // Add empty assistant message to stream into
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
                    locale,
                    meetingId: resolvedMeetingId,
                    sessionId: sessionId.current,
                }),
            });

            if (!res.ok || !res.body) {
                throw new Error("Failed to get response");
            }

            // Stream the response
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                accumulated += chunk;

                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: "assistant",
                        content: accumulated,
                    };
                    return updated;
                });
            }
        } catch {
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: "assistant",
                    content: t("error"),
                };
                return updated;
            });
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages, locale, resolvedMeetingId, t]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className={`fixed bottom-4 sm:bottom-6 z-50 ${isRTL ? "left-4 sm:left-6" : "right-4 sm:right-6"}`} dir={isRTL ? "rtl" : "ltr"}>
            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 15, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className={`fixed sm:absolute inset-0 sm:inset-auto sm:bottom-20 ${
                            isRTL ? "sm:left-0" : "sm:right-0"
                        } z-[100] w-full h-[100dvh] sm:h-auto sm:max-h-[min(600px,calc(100vh-140px))] sm:w-[380px] bg-white sm:rounded-3xl shadow-[0_20px_50px_rgba(0,43,91,0.12)] sm:border border-slate-100 overflow-hidden flex flex-col transition-all duration-300`}
                        style={{
                            height: minimized ? "56px" : undefined,
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-slate-50 to-white text-[#002B5B] flex-shrink-0 border-b border-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600"><Bot className="w-5 h-5" /></div>
                                <div>
                                    <p className="text-sm font-bold leading-tight">{t("title")}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{t("subtitle")}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-red-50 hover:text-red-500 text-slate-400 transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {!minimized && (
                            <>
                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white min-h-[300px]">
                                    {messages.map((msg, i) => (
                                        <div key={i} className={`flex gap-3 ${msg.role === "user" ? (isRTL ? "flex-row" : "flex-row-reverse") : "flex-row"}`}>
                                            {/* Avatar */}
                                            <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-white shadow-sm ${msg.role === "assistant" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                                                {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                            </div>

                                            {/* Bubble */}
                                            <div
                                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed transition-all duration-300 ${
                                                    msg.role === "assistant"
                                                        ? `bg-slate-50 text-slate-700 font-medium ${isRTL ? "rounded-tr-none" : "rounded-tl-none"}`
                                                        : `bg-[#002B5B] text-white font-semibold ${isRTL ? "rounded-tl-none" : "rounded-tr-none"} shadow-md shadow-blue-900/5`
                                                }`}
                                            >
                                                {msg.content === "" && loading && i === messages.length - 1 ? (
                                                    <span className="flex gap-1.5 items-center py-1">
                                                        <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                                        <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                                        <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                                    </span>
                                                ) : (<span className="whitespace-pre-wrap">{msg.content}</span>)}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input */}
                                <div className="p-4 bg-white border-t border-slate-50">
                                    <div className="flex gap-2.5 items-center bg-slate-50/80 p-1.5 rounded-2xl border border-slate-100 focus-within:bg-white focus-within:border-blue-200 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all duration-300">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder={t("placeholder")}
                                            disabled={loading}
                                            className="flex-1 text-sm bg-transparent px-3 py-2 focus:outline-none disabled:opacity-50 font-medium placeholder:text-slate-400"
                                            dir={isRTL ? "rtl" : "ltr"}
                                        />
                                        <button
                                            onClick={sendMessage}
                                            disabled={loading || !input.trim()}
                                            className="w-10 h-10 rounded-xl bg-[#002B5B] hover:bg-blue-800 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-blue-900/10 active:scale-90"
                                            aria-label="Send"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-slate-300 text-center mt-3 font-bold tracking-[0.2em] uppercase opacity-80">
                                        {t("poweredBy")}
                                    </p>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toggle button */}
            <motion.button
                onClick={() => setOpen((o) => !o)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#002B5B] to-blue-600 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center relative z-50 border-4 border-white"
                aria-label={open ? "Close chat" : "Open chat"}
            >
                <AnimatePresence mode="wait">
                    {open ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <X className="w-7 h-7" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="open"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <MessageCircle className="w-7 h-7" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Pulse ring */}
                {!open && <span className="absolute inset-[-4px] rounded-full bg-blue-500 animate-ping opacity-20 -z-10" />}
            </motion.button>
        </div>
    );
}
