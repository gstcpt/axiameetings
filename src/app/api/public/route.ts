import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint: returns packs, references, and app settings (contact/social only)
export async function GET() {
    try {
        const [packs, references, settings] = await Promise.all([
            prisma.packs.findMany({ include: { packs_lines: true }, orderBy: { price_month: 'asc' } }),
            prisma.references.findMany({ orderBy: { id: 'desc' } }),
            prisma.app_settings.findFirst({
                select: {
                    contact_phone: true,
                    contact_email: true,
                    contact_adress: true,
                    facebook: true,
                    linkedin: true,
                    tiktok: true,
                    from_name: true,
                    term_of_use: true,
                    privacy_policy: true,
                    logo_file_name: true,
                    favicon_file_name: true,
                },
            }),
        ]);
        return NextResponse.json({ status: true, data: { packs, references, settings } });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
