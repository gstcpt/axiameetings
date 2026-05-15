import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    try {
        const { id } = await params;
        const targetId = Number(id);
        const userData = await prisma.users.findUnique({
            where: { id: targetId },
            select: {
                id: true,
                fullname: true,
                email: true,
                username: true,
                role: true,
                phone: true,
                identifiant_extern: true,
                company_id: true,
                company: { select: { id: true, name: true } }
            },
        });

        if (!userData) {
            return NextResponse.json({ status: false, message: 'User not found' }, { status: 404 });
        }

        // Admin can only see users from their own company
        if (user.role === 'ADMIN' && userData.company_id !== user.companyId) {
            return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json({ status: true, data: userData });
    } catch (error) {
        console.error('Error fetching user details:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
