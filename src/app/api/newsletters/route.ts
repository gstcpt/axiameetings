import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

// GET: list all newsletters (developer only) | POST: subscribe (public)
export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') { return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 }); }
    try {
        const newsletters = await prisma.newsletters.findMany({ orderBy: { created_at: 'desc' } });
        return NextResponse.json({ status: true, data: newsletters });
    } catch { return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { email } = body;
        if (!email || !email.includes('@')) { return NextResponse.json({ status: false, message: 'Valid email is required' }, { status: 400 }); }
        const existing = await prisma.newsletters.findFirst({ where: { email } });
        if (existing) { return NextResponse.json({ status: false, message: 'Email already subscribed' }, { status: 409 }); }
        const newsletter = await prisma.newsletters.create({ data: { email } });

        await createLog({
            message: `New newsletter subscription: ${email}`,
            payload: { email },
            response: newsletter
        });

        return NextResponse.json({ status: true, data: newsletter });
    } catch { return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') { return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 }); }
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ status: false, message: 'ID required' }, { status: 400 });
        const existing = await prisma.newsletters.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

        await prisma.newsletters.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted newsletter subscription: ${existing.email}`,
            payload: { id, email: existing.email }
        });

        return NextResponse.json({ status: true });
    } catch { return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 }); }
}
