import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

// GET all points for a meeting
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
