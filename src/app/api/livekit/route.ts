import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/livekit
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/livekit`.
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
    const { searchParams } = new URL(req.url);
    const room = searchParams.get('room');
    const username = searchParams.get('username');

    if (!room || !username) {
        return NextResponse.json({ status: false, message: 'room and username are required' }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    // If LiveKit is not configured, return a mock token indicator
    if (!apiKey || !apiSecret) {
        return NextResponse.json({
            status: false,
            message: 'LiveKit is not configured. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL to your .env file.',
            configured: false,
        }, { status: 503 });
    }

    try {
        const at = new AccessToken(apiKey, apiSecret, {
            identity: username,
            ttl: '4h',
        });

        at.addGrant({
            roomJoin: true,
            room,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const token = await at.toJwt();
        return NextResponse.json({ status: true, token });
    } catch (error) {
        console.error('LiveKit token error:', error);
        return NextResponse.json({ status: false, message: 'Failed to generate token' }, { status: 500 });
    }
}
