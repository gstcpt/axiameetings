import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import bcrypt from 'bcryptjs';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/users
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/users`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `users`
 * - Model: `companies`

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
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get('companyId');

        let whereClause: any = {};
        if (user.role === 'ADMIN') {
            whereClause.company_id = user.companyId;
        } else if (companyId) {
            whereClause.company_id = Number(companyId);
        }

        const users = await prisma.users.findMany({
            where: whereClause,
            select: { id: true, fullname: true, email: true, username: true, role: true, phone: true, identifiant_extern: true, company_id: true, company: { select: { id: true, name: true } } },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: users });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { fullname, email, username, password, role, company_id, phone, identifiant_extern } = body;
        if (!username || !password) {
            return NextResponse.json({ status: false, message: 'Username and password are required' }, { status: 400 });
        }
        const targetCompanyId = user.role === 'ADMIN' ? user.companyId : (company_id ? Number(company_id) : null);
        
        // Enforce user limit for the company
        if (targetCompanyId) {
            const company = await prisma.companies.findUnique({
                where: { id: targetCompanyId },
                select: { users_number_limit: true, _count: { select: { users: true } } }
            });
            if (company && company.users_number_limit !== null && company._count.users >= company.users_number_limit) {
                return NextResponse.json({ 
                    status: false, 
                    message: `User limit reached for this company (${company.users_number_limit}). Please contact support to upgrade your plan.` 
                }, { status: 403 });
            }
        }

        const hashed = await bcrypt.hash(password, 10);
        const newUser = await prisma.users.create({
            data: { fullname, email, username, password: hashed, role: role || 'PARTICIPANT', company_id: targetCompanyId, phone: phone || null, identifiant_extern: identifiant_extern ? Number(identifiant_extern) : null },
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created user: ${username}`,
            payload: { fullname, email, username, role, company_id: targetCompanyId },
            response: { id: newUser.id, username: newUser.username }
        });

        const { password: _, ...safeUser } = newUser;
        return NextResponse.json({ status: true, data: safeUser }, { status: 201 });
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { id, fullname, email, username, password, role, company_id, phone, identifiant_extern } = body;
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });

        if (user.role === 'ADMIN') {
            const existing = await prisma.users.findUnique({ where: { id: Number(id) } });
            if (!existing || existing.company_id !== user.companyId) {
                return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
            }
        }

        const updateData: any = { fullname, email, username, role, phone: phone || null };
        if (identifiant_extern !== undefined) updateData.identifiant_extern = identifiant_extern ? Number(identifiant_extern) : null;
        if (user.role === 'DEVELOPER' && company_id) updateData.company_id = Number(company_id);
        if (password) updateData.password = await bcrypt.hash(password, 10);

        const updated = await prisma.users.update({ where: { id: Number(id) }, data: updateData });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated user: ${username}`,
            payload: body,
            response: { id: updated.id, username: updated.username }
        });

        const { password: _, ...safeUser } = updated;
        return NextResponse.json({ status: true, data: safeUser });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { id } = body;
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });

        const existing = await prisma.users.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'User not found' }, { status: 404 });

        if (user.role === 'ADMIN' && existing.company_id !== user.companyId) {
            return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
        }

        // ADMIN cannot delete ADMIN or DEVELOPER accounts — only DEVELOPER can
        if (user.role === 'ADMIN' && (existing.role === 'ADMIN' || existing.role === 'DEVELOPER')) {
            return NextResponse.json({ status: false, message: 'Only a Developer can delete admin accounts' }, { status: 403 });
        }

        // Prevent self-deletion
        if (existing.id === user.userId) {
            return NextResponse.json({ status: false, message: 'You cannot delete your own account' }, { status: 403 });
        }

        await prisma.users.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted user: ${existing.username}`,
            payload: { id, username: existing.username }
        });

        return NextResponse.json({ status: true, message: 'User deleted' });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
