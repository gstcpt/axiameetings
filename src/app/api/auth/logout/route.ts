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
