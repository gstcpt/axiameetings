import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/users/[id]
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/users/[id]`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `users`

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
