import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get('companyId');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
        const offset = parseInt(searchParams.get('offset') || '0');

        const where = companyId ? { company_id: Number(companyId) } : {};

        const [logs, total] = await Promise.all([
            prisma.logs.findMany({
                where,
                include: {
                    user: { select: { fullname: true, username: true, email: true, role: true } },
                    company: { select: { name: true } },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.logs.count({ where }),
        ]);

        return NextResponse.json({ status: true, data: logs, pagination: { total, limit, offset } });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    try {
        const { message, request, payload, response, company_id } = await req.json();
        const log = await prisma.logs.create({
            data: { message, request, payload, response, user_id: user.userId, company_id: company_id || user.companyId || null },
        });
        return NextResponse.json({ status: true, data: log }, { status: 201 });
    } catch (error) {
        console.error('Error creating log:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id, ids } = await req.json();
        if (id) {
            await prisma.logs.delete({ where: { id } });
        } else if (ids && Array.isArray(ids)) {
            await prisma.logs.deleteMany({ where: { id: { in: ids } } });
        } else {
            return NextResponse.json({ status: false, message: 'ID or IDs required' }, { status: 400 });
        }
        return NextResponse.json({ status: true });
    } catch (error) {
        console.error('Error deleting logs:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
