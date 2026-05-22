import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';
import { createLog } from '@/lib/logger';
import { dispatchMeetingPush } from '@/lib/push';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    try {
        const { id } = await params;
        const meeting = await prisma.meetings.findUnique({
            where: { id: Number(id) },
            include: {
                company: true,
                meetings_points: {
                    include: { meetings_votes: true, meetings_points: true },
                    orderBy: { id: 'asc' },
                },
                meetings_documents: true,
                meetings_participants: true,
                meetings_invitations: true,
                meetings_attendances: true,
            },
        });
        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        if (user.role === 'ADMIN' && meeting.company_id !== user.companyId) {
            return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.json({ status: true, data: meeting });
    } catch (error) {
        console.error('Error fetching meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const body = await req.json();
        const { sendRescheduleNotification, ...rest } = body;

        if (user.role === 'ADMIN') {
            const existing = await prisma.meetings.findUnique({ where: { id: Number(id) } });
            if (!existing || existing.company_id !== user.companyId) {
                return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
            }
        }

        // Enforce meeting time limit
        if (rest.duration) {
            const existing = await prisma.meetings.findUnique({ where: { id: Number(id) }, select: { company_id: true } });
            if (existing) {
                const company = await prisma.companies.findUnique({
                    where: { id: existing.company_id },
                    select: { meeting_time_limit: true }
                });
                if (company && company.meeting_time_limit) {
                    const DUR_ORDER = ['THIRTY_MINUTES', 'ONE_HOUR', 'TWO_HOURS', 'THREE_HOURS', 'FOUR_HOURS', 'FIVE_HOURS', 'FULL_DAY'];
                    const limitIdx = DUR_ORDER.indexOf(company.meeting_time_limit);
                    const durationIdx = DUR_ORDER.indexOf(rest.duration);
                    if (durationIdx !== -1 && limitIdx !== -1 && durationIdx > limitIdx) {
                        return NextResponse.json({
                            status: false,
                            message: `Meeting duration exceeds your company limit (${company.meeting_time_limit.replace('_', ' ')}).`
                        }, { status: 403 });
                    }
                }
            }
        }

        // Fetch existing to compare status and validate date
        const existingMeeting = await prisma.meetings.findUnique({
            where: { id: Number(id) },
            select: { status: true, company_id: true, date: true, time: true }
        });

        if (!existingMeeting) {
            return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        }

        // Validate date/time not in past
        if (rest.date !== undefined || rest.time !== undefined) {
            const updatedDate = rest.date !== undefined ? rest.date : existingMeeting.date;
            const updatedTime = rest.time !== undefined ? rest.time : existingMeeting.time;
            const meetingDateTime = new Date(`${updatedDate}T${updatedTime}`);
            if (meetingDateTime < new Date()) {
                return NextResponse.json({ status: false, message: 'La date et l\'heure de la réunion ne peuvent pas être dans le passé.' }, { status: 400 });
            }
        }

        // Only include defined fields
        const updateData: Record<string, any> = { editor_id: user.userId, updated_at: new Date() };
        if (rest.subject !== undefined) updateData.subject = rest.subject;
        if (rest.date !== undefined) updateData.date = rest.date;
        if (rest.time !== undefined) updateData.time = rest.time;
        if (rest.location !== undefined) updateData.location = rest.location;
        if (rest.description !== undefined) updateData.description = rest.description;
        if (rest.summary !== undefined) updateData.summary = rest.summary;
        if (rest.type) updateData.type = rest.type;
        if (rest.mode) updateData.mode = rest.mode;
        if (rest.duration) updateData.duration = rest.duration;
        if (rest.isonline) updateData.isonline = rest.isonline;
        if (rest.status) updateData.status = rest.status;

        // Handle participants update separately
        if (rest.participants && Array.isArray(rest.participants)) {
            const existingParticipants = await prisma.meetings_participants.findMany({
                where: { meeting_id: Number(id) }
            });
            const existingEmails = new Set(existingParticipants.map((p: any) => p.email));
            const newEmails = rest.participants.filter((email: string) => !existingEmails.has(email));
            const removedIds = existingParticipants
                .filter((p: any) => !rest.participants.includes(p.email))
                .map((p: any) => p.id);

            if (removedIds.length > 0) {
                await prisma.meetings_participants.deleteMany({ where: { id: { in: removedIds } } });
            }
            if (newEmails.length > 0) {
                await prisma.meetings_participants.createMany({
                    data: newEmails.map((email: string) => ({
                        email,
                        token: crypto.randomUUID(),
                        meeting_id: Number(id),
                    })),
                });
            }
        }

        // Handle agenda points update separately
        if (rest.points && Array.isArray(rest.points)) {
            const existingPoints = await prisma.meetings_points.findMany({
                where: { meeting_id: Number(id) },
                select: { id: true },
            });
            const pointIds = existingPoints.map((p: any) => p.id);
            if (pointIds.length > 0) {
                await prisma.meetings_votes.deleteMany({ where: { point_id: { in: pointIds } } });
            }
            await prisma.meetings_points.deleteMany({ where: { meeting_id: Number(id) } });
            if (rest.points.length > 0) {
                await prisma.meetings_points.createMany({
                    data: rest.points
                        .filter((p: any) => p.point?.trim())
                        .map((p: any) => ({
                            point: p.point.trim(),
                            description: p.description || null,
                            type: p.type || 'SIMPLE',
                            meeting_id: Number(id),
                        })),
                });
            }
        }

        // Handle documents update
        if (rest.documents && Array.isArray(rest.documents)) {
            await prisma.meetings_documents.deleteMany({ where: { meeting_id: Number(id) } });
            if (rest.documents.length > 0) {
                await prisma.meetings_documents.createMany({
                    data: rest.documents.map((d: any) => ({
                        file_title: d.file_title,
                        file_path: d.file_path,
                        meeting_id: Number(id),
                    })),
                });
            }
        }

        const meeting = await prisma.meetings.update({
            where: { id: Number(id) },
            data: updateData,
            include: {
                meetings_participants: true,
                company: { select: { id: true, name: true } },
            },
        });

        const adminLocale = req.cookies.get('NEXT_LOCALE')?.value || 'fr';

        if (sendRescheduleNotification && meeting.meetings_participants.length > 0) {
            dispatchMeetingPush({
                companyId: meeting.company_id,
                meetingId: meeting.id,
                action: 'RESCHEDULE',
                adminLocale
            });
        }

        const statusChanged = body.status && existingMeeting && body.status !== existingMeeting.status;
        if (statusChanged && meeting.meetings_participants.length > 0) {
            let action: any = 'UPDATE';
            if (body.status === 'STARTED') action = 'START';
            if (body.status === 'CANCELLED') action = 'CANCEL';
            if (body.status === 'FINISHED') action = 'FINISHED';

            dispatchMeetingPush({
                companyId: meeting.company_id,
                meetingId: meeting.id,
                action,
                adminLocale
            });
        }
        await createLog({
            message: statusChanged
                ? `Meeting status changed to ${body.status}: ${meeting.subject}`
                : `Meeting updated: ${meeting.subject}`,
            userId: user.userId,
            companyId: meeting.company_id,
            payload: body,
            response: meeting
        });

        return NextResponse.json({ status: true, data: meeting });
    } catch (error: any) {
        console.error('Error updating meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const meetingId = Number(id);

        const meeting = await prisma.meetings.findUnique({ where: { id: meetingId } });
        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        if (user.role === 'ADMIN' && meeting.company_id !== user.companyId) {
            return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
        }

        await prisma.meetings_turn_requests.deleteMany({ where: { meeting_id: meetingId } });
        const points = await prisma.meetings_points.findMany({ where: { meeting_id: meetingId }, select: { id: true } });
        if (points.length > 0) {
            await prisma.meetings_votes.deleteMany({ where: { point_id: { in: points.map(p => p.id) } } });
        }
        await prisma.meetings_attendances.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_invitations.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_participants.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_points.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_documents.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings.delete({ where: { id: meetingId } });

        // Send push notification for deletion
        const adminLocale = req.cookies.get('NEXT_LOCALE')?.value || 'fr';
        dispatchMeetingPush({
            companyId: meeting.company_id,
            meetingId: meeting.id,
            action: 'CANCEL',
            adminLocale
        });

        await createLog({
            message: `Meeting deleted: ${meeting.subject}`,
            userId: user.userId,
            companyId: meeting.company_id,
            payload: { id: meetingId },
            response: { success: true }
        });

        return NextResponse.json({ status: true, message: 'Meeting deleted' });
    } catch (error) {
        console.error('Error deleting meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

async function sendUpdateEmails(meeting: any) {
    try {
        const mailer = await getMailTransporter();
        if (mailer) {
            const { transporter, settings } = mailer;
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002';
            const companyName = (meeting.company as any)?.name || 'Axia Meetings';
            const participantsList = meeting.meetings_participants || [];

            for (const participant of participantsList) {
                const joinUrl = `${siteUrl}/meetings/${meeting.id}/join?token=${participant.token}&email=${encodeURIComponent(participant.email)}`;

                const html = getEmailTemplate(`
                    <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
                        Les détails de la réunion <strong>${meeting.subject}</strong> ont été mis à jour.
                    </p>
                    
                    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
                        <table style="width:100%;border-collapse:collapse;">
                        <tr>
                            <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;width:100px;">📅 Date</td>
                            <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:700;">${meeting.date}</td>
                        </tr>
                        <tr>
                            <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;">⏰ Heure</td>
                            <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:700;">${meeting.time}</td>
                        </tr>
                        ${meeting.location ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;">📍 Lieu</td><td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:700;">${meeting.location}</td></tr>` : ''}
                        </table>
                    </div>
                    
                    <div style="text-align:center;margin-bottom:24px;">
                        <a href="${joinUrl}" style="display:inline-block;background:#002B5B;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;">
                            ✅ Voir les détails mis à jour
                        </a>
                    </div>
                `, `Mise à jour de la réunion`, companyName);

                await transporter.sendMail({
                    from: `"${settings.from_name}" <${settings.from_email}>`,
                    to: participant.email,
                    subject: `🔔 Mise à jour: ${meeting.subject}`,
                    html: html,
                });
            }
        }
    } catch (err) {
        console.error('Update notification failed:', err);
    }
}
