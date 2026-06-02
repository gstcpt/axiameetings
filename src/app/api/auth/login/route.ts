import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signJwt } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
    const ip = getIp(req);
    if (!await rateLimit(ip, 10, 60000)) {
        return NextResponse.json({ status: false, message: 'Too many login attempts. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
        return NextResponse.json({ status: false, message: 'Username and password are required' }, { status: 400 });
    }

    try {
        // Allow login by username or email
        const user = await prisma.users.findFirst({
            where: { OR: [{ username }, { email: username }] },
            include: { company: { select: { ai_is_active: true, meeting_time_limit: true, users_number_limit: true } } }
        });

        if (!user || !user.password) {
            return NextResponse.json({ status: false, message: 'Invalid credentials' }, { status: 401 });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ status: false, message: 'Invalid credentials' }, { status: 401 });
        }

        const token = signJwt({ userId: user.id, email: user.email, role: user.role, companyId: user.company_id });

        const userData = {
            id: user.id,
            fullname: user.fullname,
            email: user.email,
            username: user.username,
            role: user.role,
            company_id: user.company_id,
            ai_is_active: user.company?.ai_is_active ?? false,
            meeting_time_limit: user.company?.meeting_time_limit ?? 'ONE_HOUR',
            users_number_limit: user.company?.users_number_limit ?? 10,
        };

        const response = NextResponse.json({
            status: true,
            message: 'Login successful',
            user: userData,
            token: token, // Added for mobile app compatibility
        });

        response.cookies.set('axia_meetings_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 8,
        });

        await createLog({
            message: `User logged in: ${user.username || user.email}`,
            userId: user.id,
            companyId: user.company_id,
            payload: { username },
            response: { success: true, role: user.role }
        });

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
