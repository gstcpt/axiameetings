import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { createLog } from '@/lib/logger';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies/admins
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies/admins`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `users`
 * - Model: `companies_admins_login`
 * RELATIONS INCLUDED: 
 * company: { select: { id: true, name: true

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
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get('companyId');
        const admins = await prisma.users.findMany({
            where: {
                role: 'ADMIN',
                ...(companyId ? { company_id: Number(companyId) } : {}),
            },
            include: {
                company: { select: { id: true, name: true } },
                companies_admins_login: { select: { id: true, token_id: true, company_id: true, identifiant_extern: true } },
            },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: admins });
    } catch (error) {
        console.error('Error fetching admins:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { fullname, email, username, password, company_id, identifiant_extern } = await req.json();
        if (!username || !password || !company_id) {
            return NextResponse.json({ status: false, message: 'Username, password and company are required' }, { status: 400 });
        }
        const hashed = await bcrypt.hash(password, 10);
        const admin = await prisma.users.create({
            data: { fullname, email, username, password: hashed, role: 'ADMIN', company_id: Number(company_id), identifiant_extern: identifiant_extern ? Number(identifiant_extern) : null },
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created company admin: ${username}`,
            payload: { fullname, email, username, company_id },
            response: { id: admin.id, username: admin.username }
        });

        return NextResponse.json({ status: true, data: admin }, { status: 201 });
    } catch (error) {
        console.error('Error creating admin:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id, fullname, email, username, password, company_id, identifiant_extern } = await req.json();
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        const updateData: any = { fullname, email, username, company_id: Number(company_id) };
        if (identifiant_extern !== undefined) updateData.identifiant_extern = identifiant_extern ? Number(identifiant_extern) : null;
        if (password) updateData.password = await bcrypt.hash(password, 10);
        const admin = await prisma.users.update({ where: { id: Number(id) }, data: updateData });
        
        // Also update identifiant_extern in companies_admins_login if it exists
        if (identifiant_extern !== undefined) {
            await prisma.companies_admins_login.updateMany({
                where: { user_id: Number(id) },
                data: { identifiant_extern: identifiant_extern ? Number(identifiant_extern) : null }
            });
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated company admin: ${username}`,
            payload: { id, fullname, email, username, company_id },
            response: { id: admin.id, username: admin.username }
        });

        return NextResponse.json({ status: true, data: admin });
    } catch (error) {
        console.error('Error updating admin:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        const existing = await prisma.users.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Admin not found' }, { status: 404 });

        await prisma.users.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted company admin: ${existing.username}`,
            payload: { id, username: existing.username }
        });

        return NextResponse.json({ status: true, message: 'Admin deleted' });
    } catch (error) {
        console.error('Error deleting admin:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
