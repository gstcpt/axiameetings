import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';

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
