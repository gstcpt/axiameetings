import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

// GET: fetch full meeting data for PV generation
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    // Allow access via JWT or participant token
    if (!user && (!token || !email)) {
        return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!user && token && email) {
        const participant = await prisma.meetings_participants.findFirst({
            where: { meeting_id: Number(id), token, email },
        });
        if (!participant) return NextResponse.json({ status: false, message: 'Invalid token' }, { status: 401 });
    }

    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: Number(id) },
            include: {
                company: true,
                meetings_points: {
                    include: {
                        meetings_votes: {
                            include: { meetings_participant: { select: { email: true } } },
                        },
                    },
                },
                meetings_documents: true,
                meetings_participants: true,
                meetings_attendances: {
                    include: { meetings_participant: { select: { email: true } } },
                },
            },
        });

        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        if (user?.role === 'ADMIN' && meeting.company_id !== user.companyId) {
            return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json({ status: true, data: meeting });
    } catch (error) {
        console.error('Error fetching PV data:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
