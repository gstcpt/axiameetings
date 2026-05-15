'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './context/AuthContext';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';

export function NotificationBridge() {
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!user || !user.email) return;

        const socket = io(window.location.origin);

        socket.on('connect', () => {
            console.log('Notification bridge connected');
            socket.emit('join-user', user.email);
        });

        socket.on('notification:new', (data: { title: string; body: string; meetingId: number; type: string }) => {
            console.log('New internal notification received:', data);
            
            toast(data.title, {
                description: data.body,
                duration: 8000,
                icon: <Bell className="text-blue-500" size={18} />,
                action: {
                    label: 'Rejoindre',
                    onClick: () => router.push(`/meetings/${data.meetingId}`)
                },
            });
        });

        return () => {
            socket.disconnect();
        };
    }, [user, router]);

    return null; // This component doesn't render anything visible
}
