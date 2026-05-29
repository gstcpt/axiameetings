import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (user) {
        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `User logged out`,
            payload: { method: 'POST' }
        });
    }
    const response = NextResponse.json({ status: true, message: 'Logged out successfully' });
    response.cookies.set('axia_meetings_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
}

/**
 * @description AI Agent Documentation
 * Endpoint: /api/auth/logout
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/auth/logout`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED: None or custom query.

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
    if (user) {
        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `User logged out`,
            payload: { method: 'GET' }
        });
    }
    const response = NextResponse.json({ status: true, message: 'Logged out successfully' });
    response.cookies.set('axia_meetings_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
}
