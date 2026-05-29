import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/auth/session
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/auth/session`.
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
export async function GET(req: NextRequest) {
    const token = req.cookies.get('axia_meetings_token')?.value || req.headers.get('Authorization')?.split(' ')[1];
    
    if (!token) {
        return NextResponse.json({ isAuthenticated: false }, { status: 401 });
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
        return NextResponse.json({ isAuthenticated: false }, { status: 401 });
    }

    try {
        const user = await prisma.users.findUnique({
            where: { id: decoded.userId },
            select: { 
                id: true, fullname: true, email: true, username: true, role: true, company_id: true, 
                company: { select: { ai_is_active: true, meeting_time_limit: true, users_number_limit: true } } 
            },
        });

        if (!user) {
            return NextResponse.json({ isAuthenticated: false }, { status: 401 });
        }

        const userData = { 
            ...user, 
            ai_is_active: user.company?.ai_is_active ?? false,
            meeting_time_limit: user.company?.meeting_time_limit ?? 'ONE_HOUR',
            users_number_limit: user.company?.users_number_limit ?? 10
        };
        delete (userData as any).company;

        return NextResponse.json({ isAuthenticated: true, user: userData });
    } catch {
        return NextResponse.json({ isAuthenticated: false }, { status: 500 });
    }
}
