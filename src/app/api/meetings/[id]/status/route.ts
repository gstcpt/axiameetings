import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { notifyParticipants } from '@/lib/notifier';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    try {
        const { id } = await params;
        const meetingId = Number(id);
        const { status } = await req.json();

        if (!status) {
            return NextResponse.json({ status: false, message: 'Status is required' }, { status: 400 });
        }

        const existing = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: { meetings_participants: true }
        });

        if (!existing) {
            return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        }

        if (user.role === 'ADMIN' && existing.company_id !== user.companyId) {
            return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
        }

        const updatedMeeting = await prisma.meetings.update({
            where: { id: meetingId },
            data: { status, updated_at: new Date() },
            include: { 
                meetings_participants: true,
                company: { select: { id: true, name: true } }
            }
        });

        // Notifications
        if (existing.status !== status && updatedMeeting.meetings_participants.length > 0) {
            const statusMap: any = {
                'STARTED': 'a commencé',
                'FINISHED': 'est terminée',
                'CANCELLED': 'est annulée',
                'SCHEDULED': 'est planifiée'
            };
            const statusText = statusMap[status] || status;
            
            await notifyParticipants({
                companyId: updatedMeeting.company_id,
                meeting: updatedMeeting,
                type: status === 'STARTED' ? 'START' : status === 'CANCELLED' ? 'CANCEL' : status === 'FINISHED' ? 'FINISHED' : 'UPDATE',
                subject: status === 'STARTED' ? 'En direct' : status === 'FINISHED' ? 'Terminée' : status === 'CANCELLED' ? 'Annulée' : 'Planifiée',
                body: `${updatedMeeting.subject}`,
                participants: updatedMeeting.meetings_participants
            }).catch((err: any) => {
                console.error('Status notification failed:', err);
            });
        }

        await createLog({
            message: `Meeting status changed to ${status}: ${updatedMeeting.subject}`,
            userId: user.userId,
            companyId: updatedMeeting.company_id,
            payload: { status },
            response: updatedMeeting
        });

        return NextResponse.json({ status: true, data: updatedMeeting });
    } catch (error) {
        console.error('Error updating meeting status:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
