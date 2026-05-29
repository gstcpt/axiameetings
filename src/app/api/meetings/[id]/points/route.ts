import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

// GET all points for a meeting
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]/points
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]/points`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings_points`
 * - Model: `meetings`
 * - Model: `meetings_votes`
 * RELATIONS INCLUDED: 
 * meetings_votes: true, meetings_points: true

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
    if (!user) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    try {
        const points = await prisma.meetings_points.findMany({
            where: { meeting_id: Number(id), parent_id: null },
            include: { meetings_votes: true, meetings_points: true },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: points });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// POST add a point
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const { point, description, type } = await req.json();
        if (!point) return NextResponse.json({ status: false, message: 'Point text is required' }, { status: 400 });
        const created = await prisma.meetings_points.create({
            data: {
                point,
                description: description || null,
                type: type || 'SIMPLE',
                meeting_id: Number(id),
            },
        });
        const meeting = await prisma.meetings.findUnique({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Added point to meeting "${meeting?.subject}": ${point}`,
            payload: { point, description, type, meeting_id: id },
            response: created
        });

        return NextResponse.json({ status: true, data: created }, { status: 201 });
    } catch (error) {
        console.error('Error creating point:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// PUT update a point
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const { point_id, point, description, type } = await req.json();
        if (!point_id) return NextResponse.json({ status: false, message: 'point_id is required' }, { status: 400 });
        const updated = await prisma.meetings_points.update({
            where: { id: Number(point_id) },
            data: { point, description: description || null, type: type || 'SIMPLE' },
        });
        const meeting = await prisma.meetings.findUnique({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated point in meeting "${meeting?.subject}": ${point}`,
            payload: { point_id, point, description, type },
            response: updated
        });

        return NextResponse.json({ status: true, data: updated });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// DELETE a point
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const { point_id } = await req.json();
        if (!point_id) return NextResponse.json({ status: false, message: 'point_id is required' }, { status: 400 });
        const existingPoint = await prisma.meetings_points.findUnique({ where: { id: Number(point_id) } });
        const meeting = await prisma.meetings.findUnique({ where: { id: Number(id) } });

        // Delete votes first
        await prisma.meetings_votes.deleteMany({ where: { point_id: Number(point_id) } });
        await prisma.meetings_points.delete({ where: { id: Number(point_id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted point from meeting "${meeting?.subject}": ${existingPoint?.point}`,
            payload: { point_id, meeting_id: id }
        });

        return NextResponse.json({ status: true, message: 'Point deleted' });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
