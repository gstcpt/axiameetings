import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/logs
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/logs`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `logs`
 * RELATIONS INCLUDED: 
 * user: { select: { fullname: true, username: true, email: true, role: true

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
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
        const offset = parseInt(searchParams.get('offset') || '0');

        const where = companyId ? { company_id: Number(companyId) } : {};

        const [logs, total] = await Promise.all([
            prisma.logs.findMany({
                where,
                include: {
                    user: { select: { fullname: true, username: true, email: true, role: true } },
                    company: { select: { name: true } },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.logs.count({ where }),
        ]);

        return NextResponse.json({ status: true, data: logs, pagination: { total, limit, offset } });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    try {
        const { message, request, payload, response, company_id } = await req.json();
        const log = await prisma.logs.create({
            data: { message, request, payload, response, user_id: user.userId, company_id: company_id || user.companyId || null },
        });
        return NextResponse.json({ status: true, data: log }, { status: 201 });
    } catch (error) {
        console.error('Error creating log:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id, ids } = await req.json();
        if (id) {
            await prisma.logs.delete({ where: { id } });
        } else if (ids && Array.isArray(ids)) {
            await prisma.logs.deleteMany({ where: { id: { in: ids } } });
        } else {
            return NextResponse.json({ status: false, message: 'ID or IDs required' }, { status: 400 });
        }
        return NextResponse.json({ status: true });
    } catch (error) {
        console.error('Error deleting logs:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
