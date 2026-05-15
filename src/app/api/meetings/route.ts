import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';
import { createLog } from '@/lib/logger';
import { notifyParticipants } from '@/lib/notifier';

export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    try {
        const whereClause = user.role === 'ADMIN' && user.companyId
            ? { company_id: user.companyId }
            : user.role === 'DEVELOPER' ? {} 
            : user.role === 'PARTICIPANT' ? { meetings_participants: { some: { email: user.email } } }
            : { company_id: -1 };

        const meetings = await prisma.meetings.findMany({
            where: whereClause,
            include: {
                company: { select: { id: true, name: true, logo_url: true } },
                meetings_participants: { select: { id: true, email: true } },
                meetings_points: { select: { id: true, point: true, type: true, description: true } },
                meetings_attendances: { select: { id: true, meetings_attendances_status: true } },
                meetings_documents: true,
                _count: { select: { meetings_documents: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        return NextResponse.json({ status: true, data: meetings });
    } catch (error) {
        console.error('Error fetching meetings:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { subject, type, date, time, mode, location, duration, description, isonline, company_id, points, participants, documents } = body;

        if (!subject || !date || !time) {
            return NextResponse.json({ status: false, message: 'Subject, date and time are required' }, { status: 400 });
        }

        const targetCompanyId = user.role === 'ADMIN' ? user.companyId! : Number(company_id);

        // Enforce meeting time limit
        if (duration) {
            const company = await prisma.companies.findUnique({
                where: { id: targetCompanyId },
                select: { meeting_time_limit: true }
            });
            if (company && company.meeting_time_limit) {
                const DUR_ORDER = ['THIRTY_MINUTES', 'ONE_HOUR', 'TWO_HOURS', 'THREE_HOURS', 'FOUR_HOURS', 'FIVE_HOURS', 'FULL_DAY'];
                const limitIdx = DUR_ORDER.indexOf(company.meeting_time_limit);
                const durationIdx = DUR_ORDER.indexOf(duration);
                if (durationIdx !== -1 && limitIdx !== -1 && durationIdx > limitIdx) {
                    return NextResponse.json({ 
                        status: false, 
                        message: `Meeting duration exceeds your company limit (${company.meeting_time_limit.replace('_', ' ')}).` 
                    }, { status: 403 });
                }
            }
        }

        const meeting = await prisma.meetings.create({
            data: {
                subject, type: type || 'ORDINAIRE', date, time,
                mode: mode || 'IN_PERSON', location: location || '', duration: duration || 'ONE_HOUR',
                description: description || '', isonline: isonline || 'FALSE',
                status: 'SCHEDULED', creator_id: user.userId, editor_id: user.userId,
                company_id: targetCompanyId,
                meetings_points: points?.length ? {
                    create: points.map((p: any) => ({
                        point: p.point.replace(/^\[VOTE\]\s*/i, ''),
                        description: p.description || null,
                        type: /^\[VOTE\]/i.test(p.point) ? 'VOTE' : (p.type || 'SIMPLE'),
                    })),
                } : undefined,
                meetings_participants: participants?.length ? {
                    create: participants.map((email: string) => ({
                        email, token: crypto.randomUUID(),
                    })),
                } : undefined,
                meetings_documents: documents?.length ? {
                    create: documents.map((d: any) => ({
                        file_title: d.file_title,
                        file_path: d.file_path,
                    })),
                } : undefined,
            },
            include: {
                meetings_participants: true,
                meetings_points: true,
                meetings_documents: true,
                company: { select: { id: true, name: true } },
            },
        });

        // Send universal notifications if participants exist
        let expiredToken = false;
        const participantsList = (meeting as any).meetings_participants || [];
        if (participantsList.length > 0) {
            const result = await notifyParticipants({
                companyId: targetCompanyId,
                meeting,
                type: 'INVITATION',
                subject: `Nouvelle`,
                body: `${meeting.subject}`,
                participants: participantsList
            }).catch((err: any) => {
                console.error('Notifications failed:', err);
                return { expired: false };
            });
            if (result?.expired) expiredToken = true;
        }


        await createLog({
            message: `Meeting created: ${meeting.subject}`,
            userId: user.userId,
            companyId: targetCompanyId,
            payload: body,
            response: meeting
        });

        return NextResponse.json({ status: true, data: meeting, expiredToken }, { status: 201 });
    } catch (error) {
        console.error('Error creating meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
