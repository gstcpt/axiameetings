import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

// POST add a document link
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const { file_title, file_path } = await req.json();
        if (!file_title || !file_path) {
            return NextResponse.json({ status: false, message: 'file_title and file_path are required' }, { status: 400 });
        }
        const doc = await prisma.meetings_documents.create({
            data: { file_title, file_path, meeting_id: Number(id) },
        });
        return NextResponse.json({ status: true, data: doc }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// DELETE remove a document
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'DEVELOPER' && user.role !== 'ADMIN')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { document_id } = await req.json();
        if (!document_id) return NextResponse.json({ status: false, message: 'document_id is required' }, { status: 400 });
        await prisma.meetings_documents.delete({ where: { id: Number(document_id) } });
        return NextResponse.json({ status: true, message: 'Document removed' });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
