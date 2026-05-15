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
        const settings = await prisma.app_settings.findFirst();
        return NextResponse.json({ status: true, data: settings });
    } catch (error) {
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
        const {
            email, email_password, host, port, ssl, from_email, from_name,
            logo_file_name, favicon_file_name,
            contact_phone, contact_email, contact_adress,
            facebook, linkedin, tiktok,
            term_of_use, privacy_policy,
        } = body;
        if (!email || !email_password || !host || !port || ssl === undefined || !from_email || !from_name) {
            return NextResponse.json({ status: false, message: 'SMTP fields are required' }, { status: 400 });
        }
        const data = {
            email, email_password, host, port: Number(port), ssl, from_email, from_name,
            logo_file_name: logo_file_name || null,
            favicon_file_name: favicon_file_name || null,
            contact_phone: contact_phone || null,
            contact_email: contact_email || null,
            contact_adress: contact_adress || null,
            facebook: facebook || null,
            linkedin: linkedin || null,
            tiktok: tiktok || null,
            term_of_use: term_of_use || null,
            privacy_policy: privacy_policy || null,
        };
        const existing = await prisma.app_settings.findFirst();
        let settings;
        if (existing) {
            settings = await prisma.app_settings.update({ where: { id: existing.id }, data });
        } else {
            settings = await prisma.app_settings.create({ data });
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated system configurations`,
            payload: { ...body, email_password: '***' },
            response: { ...settings, email_password: '***' }
        });

        return NextResponse.json({ status: true, data: settings });
    } catch (error) {
        console.error('Error saving settings:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
