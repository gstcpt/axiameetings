import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get('companyId');
        const apis = await prisma.companies_apis.findMany({
            where: companyId ? { company_id: Number(companyId) } : {},
            include: {
                company: { select: { id: true, name: true } },
                formated_responses: true,
            },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: apis });
    } catch (error) {
        console.error('Error fetching APIs:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { endpoint, method, payload_example, response_example, company_id } = await req.json();
        if (!endpoint || !method || !company_id) {
            return NextResponse.json({ status: false, message: 'Endpoint, method and company are required' }, { status: 400 });
        }
        const api = await prisma.companies_apis.create({
            data: { endpoint, method, payload_example, response_example, company_id: Number(company_id) },
        });
        return NextResponse.json({ status: true, data: api }, { status: 201 });
    } catch (error) {
        console.error('Error creating API:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id, endpoint, method, payload_example, response_example } = await req.json();
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        const api = await prisma.companies_apis.update({
            where: { id: Number(id) },
            data: { endpoint, method, payload_example, response_example },
        });
        return NextResponse.json({ status: true, data: api });
    } catch (error) {
        console.error('Error updating API:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        await prisma.companies_apis.delete({ where: { id: Number(id) } });
        return NextResponse.json({ status: true, message: 'API deleted' });
    } catch (error) {
        console.error('Error deleting API:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
