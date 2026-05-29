import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

// GET: fetch full meeting data for PV generation
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]/pv
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]/pv`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings_participants`
 * - Model: `meetings`
 * RELATIONS INCLUDED: 
 * company: true, meetings_points: { include: { meetings_votes: { include: { meetings_participant: { select: { email: true | meetings_participant: { select: { email: true

 * AI AGENT DATA ACCESS & ROLE RULES:
 * 1. UNAUTHENTICATED: Only provide general AxiaMeetings info (total companies, users, references, guides).
 * 2. ADMIN: Restrict all answers to data where companyId matches the admin's company. They can query specific meetings, users, etc., within their company.
 * 3. PARTICIPANT (Token): Restrict all answers strictly to the single meeting associated with their token.
 * 4. DEVELOPER: Full access to all data.
 * 
 * INSTRUCTIONS FOR AI:
 * - Read `prisma/schema.prisma` first to understand the exact fields and relations available for the models listed above.
 * - Call this GET endpoint to fetch the JSON data.
 * - Parse the JSON, filter it according to the ROLE RULES above, and return the exact properties the user asked for.
 */
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
