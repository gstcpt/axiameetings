import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

// Public GET + developer POST
export async function GET() {
    try {
        const packs = await prisma.packs.findMany({
            include: { packs_lines: true },
            orderBy: { price_month: 'asc' },
        });
        return NextResponse.json({ status: true, data: packs });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { name, price_month, price_year, packs_lines } = body;
        if (!name || price_month === undefined || price_year === undefined) {
            return NextResponse.json({ status: false, message: 'name, price_month, price_year are required' }, { status: 400 });
        }
        const pack = await prisma.packs.create({
            data: {
                name,
                price_month: Number(price_month),
                price_year: Number(price_year),
                packs_lines: {
                    create: (packs_lines || []).map((t: string) => ({ title: t })),
                },
            },
            include: { packs_lines: true },
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created pack: ${name}`,
            payload: body,
            response: pack
        });

        return NextResponse.json({ status: true, data: pack });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
