import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

// POST: save/replace format mappings for an API endpoint
export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { endpoint_id, mappings } = await req.json();
        if (!endpoint_id) {
            return NextResponse.json({ status: false, message: 'endpoint_id is required' }, { status: 400 });
        }

        // Delete existing mappings and recreate
        await prisma.formated_response.deleteMany({ where: { endpoint_id: Number(endpoint_id) } });

        if (mappings && mappings.length > 0) {
            await prisma.formated_response.createMany({
                data: mappings
                    .filter((m: any) => m.response_key && m.formated_response_key)
                    .map((m: any) => ({
                        endpoint_id: Number(endpoint_id),
                        response_key: m.response_key,
                        formated_response_key: m.formated_response_key,
                        format_for: m.format_for || 'RESPONSE',
                    })),
            });
        }

        return NextResponse.json({ status: true, message: 'Mappings saved' });
    } catch (error) {
        console.error('Error saving format mappings:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// GET: fetch format mappings for an endpoint
export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { searchParams } = new URL(req.url);
        const endpointId = searchParams.get('endpointId');
        if (!endpointId) {
            return NextResponse.json({ status: false, message: 'endpointId is required' }, { status: 400 });
        }
        const mappings = await prisma.formated_response.findMany({
            where: { endpoint_id: Number(endpointId) },
        });
        return NextResponse.json({ status: true, data: mappings });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
