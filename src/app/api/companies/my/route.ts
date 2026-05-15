import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    if (!user.companyId && user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'No company associated with this user' }, { status: 404 });
    }

    try {
        const companyId = user.companyId!;
        const company = await prisma.companies.findUnique({
            where: { id: companyId },
            include: {
                companies_apis_list: true,
                login_endpoint: true,
                users_endpoint: true,
                notifications_service_endpoint: true,
                messages_service_endpoint: true,
                sms_service_endpoint: true,
                _count: { select: { users: true, meetings: true } },
            },
        });

        if (!company) {
            return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
        }

        return NextResponse.json({ status: true, data: company });
    } catch (error) {
        console.error('Error fetching company details:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
