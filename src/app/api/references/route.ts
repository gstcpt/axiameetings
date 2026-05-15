import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export async function GET(req: NextRequest) {
    try {
        const references = await prisma.references.findMany({ orderBy: { name: 'asc' } });
        return NextResponse.json({ status: true, data: references });
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
        const { name, logo_file_name, website } = body;
        if (!name || !logo_file_name || !website) {
            return NextResponse.json({ status: false, message: 'All fields are required' }, { status: 400 });
        }
        const ref = await prisma.references.create({ data: { name, logo_file_name, website } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created reference: ${name}`,
            payload: body,
            response: ref
        });

        return NextResponse.json({ status: true, data: ref });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
