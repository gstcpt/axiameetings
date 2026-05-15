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
        const pack = await prisma.packs.findUnique({
            where: { id: Number(id) },
            include: { packs_lines: true },
        });
        if (!pack) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ status: true, data: pack });
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
    const packId = Number(id);

    try {
        const body = await req.json();
        const { name, price_month, price_year, packs_lines } = body;

        // Atomic nested update for maximum stability and to resolve P2002
        const pack = await prisma.packs.update({
            where: { id: packId },
            data: {
                name,
                price_month: Number(price_month),
                price_year: Number(price_year),
                packs_lines: {
                    deleteMany: {},
                    create: packs_lines.map((t: string) => ({ 
                        title: t 
                    })),
                },
            },
            include: { packs_lines: true },
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated pack: ${name}`,
            payload: body,
            response: pack
        });

        return NextResponse.json({ status: true, data: pack });
    } catch (e) {
        console.error("Failed to update pack", e);
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
        const existing = await prisma.packs.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

        await prisma.packs.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted pack: ${existing.name}`,
            payload: { id, name: existing.name }
        });

        return NextResponse.json({ status: true });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
