import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/configurations
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/configurations`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `app_settings`

 * AI AGENT DATA ACCESS & ROLE RULES:
 * 1. UNAUTHENTICATED: Only provide general AxiaMeetings info (total companies, users, references, guides).
 * 2. ADMIN: Restrict all answers to data where companyId matches the admin's company. They can query specific meetings, users, etc., within their company.
 * 3. PARTICIPANT (Token): Restrict all answers strictly to the single meeting associated with their token.
 * 4. DEVELOPER: Full access to all data.
 * 
 * INSTRUCTIONS FOR AI:
 * - Read `prisma/schema.prisma` first to understand the exact fields and relations available for the models listed above.
 * - Call this GET endpoint to fetch the JSON data.
 * - Parse the JSON, filter it according to the ROLE RULES above, and return the exact properties the user asked for.
 */
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
