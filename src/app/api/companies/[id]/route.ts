import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const company = await prisma.companies.findUnique({
            where: { id: Number(id) },
            include: {
                companies_apis_list: { include: { formated_responses: true } },
                login_endpoint: true,
                users_endpoint: true,
                notifications_service_endpoint: true,
                messages_service_endpoint: true,
                sms_service_endpoint: true,
            },
        });
        if (!company) return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
        return NextResponse.json({ status: true, data: company });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const body = await req.json();
        const {
            name, logo_url, url, database_schema,
            login_endpoint_id, users_endpoint_id,
            have_notifications_service, notifications_service_endpoint_id,
            have_messages_service, messages_service_endpoint_id,
            have_sms_service, sms_service_endpoint_id,
            have_mail_service, push_mails_endpoint_id,
            ai_is_active, mail_is_active, meeting_time_limit, users_number_limit,
        } = body;

        // Build data object dynamically to support partial updates (e.g., just ai_is_active toggle)
        const data: Record<string, any> = {};
        if (name !== undefined) data.name = name;
        if (logo_url !== undefined) data.logo_url = logo_url;
        if (url !== undefined) data.url = url;
        if (database_schema !== undefined) data.database_schema = database_schema;
        if (login_endpoint_id !== undefined) data.login_endpoint_id = login_endpoint_id ? Number(login_endpoint_id) : null;
        if (users_endpoint_id !== undefined) data.users_endpoint_id = users_endpoint_id ? Number(users_endpoint_id) : null;
        if (have_notifications_service !== undefined) data.have_notifications_service = !!have_notifications_service;
        if (notifications_service_endpoint_id !== undefined) data.notifications_service_endpoint_id = notifications_service_endpoint_id ? Number(notifications_service_endpoint_id) : null;
        if (have_messages_service !== undefined) data.have_messages_service = !!have_messages_service;
        if (messages_service_endpoint_id !== undefined) data.messages_service_endpoint_id = messages_service_endpoint_id ? Number(messages_service_endpoint_id) : null;
        if (have_sms_service !== undefined) data.have_sms_service = !!have_sms_service;
        if (sms_service_endpoint_id !== undefined) data.sms_service_endpoint_id = sms_service_endpoint_id ? Number(sms_service_endpoint_id) : null;
        if (have_mail_service !== undefined) data.have_mail_service = !!have_mail_service;
        if (push_mails_endpoint_id !== undefined) data.push_mails_endpoint_id = push_mails_endpoint_id ? Number(push_mails_endpoint_id) : null;
        if (ai_is_active !== undefined) data.ai_is_active = !!ai_is_active;
        if (mail_is_active !== undefined) data.mail_is_active = !!mail_is_active;
        if (meeting_time_limit !== undefined) data.meeting_time_limit = meeting_time_limit;
        if (users_number_limit !== undefined) data.users_number_limit = users_number_limit !== null ? Number(users_number_limit) : null;

        const company = await prisma.companies.update({
            where: { id: Number(id) },
            data,
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated company: ${company.name}`,
            payload: body,
            response: company
        });

        return NextResponse.json({ status: true, data: company });
    } catch (error) {
        console.error('Error updating company:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const existing = await prisma.companies.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });

        await prisma.companies.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted company: ${existing.name}`,
            payload: { id, name: existing.name }
        });

        return NextResponse.json({ status: true, message: 'Company deleted' });
    } catch (error) {
        console.error('Error deleting company:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
