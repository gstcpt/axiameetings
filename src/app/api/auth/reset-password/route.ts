import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
    const ip = getIp(req);
    if (!rateLimit(ip, 5, 60000)) {
        return NextResponse.json({ status: false, message: 'Too many attempts. Please try again later.' }, { status: 429 });
    }
    try {
        const { token, password } = await req.json();

        if (!token || !password) {
            return NextResponse.json({ status: false, message: 'Token and password are required' }, { status: 400 });
        }

        if (password.length < 8) {
            return NextResponse.json({ status: false, message: 'Password must be at least 8 characters' }, { status: 400 });
        }

        const user = await prisma.users.findFirst({
            where: {
                reset_token: token,
                reset_token_expiry: { gte: new Date() },
            },
        });

        if (!user) {
            return NextResponse.json({ status: false, message: 'Invalid or expired reset link' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await prisma.users.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                reset_token: null,
                reset_token_expiry: null,
            },
        });

        return NextResponse.json({ status: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}