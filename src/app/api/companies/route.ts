import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const companies = await prisma.companies.findMany({
            include: {
                companies_apis_list: { select: { id: true, endpoint: true, method: true } },
                login_endpoint: { select: { id: true, endpoint: true, method: true } },
                users_endpoint: { select: { id: true, endpoint: true, method: true } },
                notifications_service_endpoint: { select: { id: true, endpoint: true, method: true } },
                messages_service_endpoint: { select: { id: true, endpoint: true, method: true } },
                sms_service_endpoint: { select: { id: true, endpoint: true, method: true } },
                _count: { select: { users: true, meetings: true } },
            },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: companies });
    } catch (error) {
        console.error('Error fetching companies:', error);
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
        const { name, logo_url, url, database_schema, meeting_time_limit, users_number_limit } = body;
        if (!name || !url) {
            return NextResponse.json({ status: false, message: 'Name and URL are required' }, { status: 400 });
        }
        const company = await prisma.companies.create({
            data: { 
                name, 
                logo_url: logo_url || '', 
                url, 
                database_schema: database_schema || '',
                meeting_time_limit: meeting_time_limit || 'ONE_HOUR',
                users_number_limit: users_number_limit !== undefined ? Number(users_number_limit) : 10
            },
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created company: ${name}`,
            payload: body,
            response: company
        });

        return NextResponse.json({ status: true, data: company }, { status: 201 });
    } catch (error) {
        console.error('Error creating company:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
