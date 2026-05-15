import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const ref = await prisma.references.findUnique({ where: { id: Number(id) } });
        if (!ref) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ status: true, data: ref });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const body = await req.json();
        const { name, logo_file_name, website } = body;
        const ref = await prisma.references.update({
            where: { id: Number(id) },
            data: { name, logo_file_name, website },
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated reference: ${ref.name}`,
            payload: body,
            response: ref
        });

        return NextResponse.json({ status: true, data: ref });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const existing = await prisma.references.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

        await prisma.references.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted reference: ${existing.name}`,
            payload: { id, name: existing.name }
        });

        return NextResponse.json({ status: true });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
