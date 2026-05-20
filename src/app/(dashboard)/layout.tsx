'use client';

import '@/app/globals.css';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { AuthGuard } from '@/components/AuthGuard';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { NotificationBridge } from '@/components/NotificationBridge';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <AuthGuard>
            <NotificationBridge />
            <div className="flex min-h-screen bg-[#FDFDFD] relative overflow-hidden">
                {/* Background decorative elements for the entire dashboard */}
                <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-blue-50/30 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 -z-10 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-indigo-50/20 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 -z-10 pointer-events-none"></div>

                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                
                <div className="flex-1 flex flex-col min-h-screen lg:ms-72 transition-all duration-500 min-w-0 relative z-10">
                    <Navbar onMenuClick={() => setSidebarOpen(true)} />
                    
                    <main className="flex-1 p-4 md:p-6 lg:p-8">
                        <AnimatePresence mode="wait">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
                            >
                                {children}
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>
            </div>
        </AuthGuard>
    );
}
