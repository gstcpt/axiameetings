import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { fullname, email, password, company_name, company_url, pack_id } = body;

        if (!fullname || !email || !password || !company_name || !pack_id) {
            return NextResponse.json({ status: false, message: 'All fields (fullname, email, password, company_name, pack_id) are required' }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await prisma.users.findFirst({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ status: false, message: 'An account with this email address already exists' }, { status: 400 });
        }

        // Check if there is already a pending signup request for this email
        const existingRequest = await prisma.signup_requests.findFirst({
            where: { email, status: 'PENDING' },
        });

        if (existingRequest) {
            return NextResponse.json({ status: false, message: 'A registration request for this email is already pending approval' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newRequest = await prisma.signup_requests.create({
            data: {
                fullname,
                email,
                password: hashedPassword,
                company_name,
                company_url: company_url || null,
                pack_id: Number(pack_id),
            },
        });

        return NextResponse.json({ status: true, data: { id: newRequest.id, email: newRequest.email } }, { status: 201 });
    } catch (error) {
        console.error('Error submitting signup request:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
