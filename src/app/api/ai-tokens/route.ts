import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ─── GET: list all tokens with today's usage stats ─────────────────────────
export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tokens = await prisma.ia_tokens_keys.findMany({
        orderBy: { id: 'asc' },
        include: {
            usage: {
                where: { used_at: { gte: todayStart } },
                select: { feature: true, success: true, used_at: true },
            },
        },
    });

    // Compute stats per token
    const result = tokens.map(t => {
        const todayUsage = t.usage;
        const byFeature: Record<string, number> = {};
        todayUsage.forEach(u => {
            byFeature[u.feature] = (byFeature[u.feature] || 0) + 1;
        });
        const todayTotal = todayUsage.length;
        const todaySuccess = todayUsage.filter(u => u.success).length;
        const creditLimit = t.credit_limit ? parseInt(t.credit_limit) : null;
        const remaining = creditLimit !== null ? Math.max(0, creditLimit - todayTotal) : null;
        const isExhausted = creditLimit !== null && remaining === 0;

        return {
            id: t.id,
            provider: t.provider,
            name: t.name,
            credit_limit: t.credit_limit,
            expiration: t.expiration,
            websocket_url: t.websocket_url,
            api_key: t.api_key,
            api_secret: t.api_secret,
            project_name: t.project_name,
            project_number: t.project_number,
            is_active: t.is_active,
            created_at: t.created_at,
            stats: {
                todayTotal,
                todaySuccess,
                todayFailed: todayTotal - todaySuccess,
                remaining,
                creditLimit,
                isExhausted,
                byFeature,
            },
        };
    });

    return NextResponse.json({ status: true, data: result });
}

// ─── POST: create token ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    if (!body.api_key) {
        return NextResponse.json({ status: false, message: 'api_key is required' }, { status: 400 });
    }
    const token = await prisma.ia_tokens_keys.create({
        data: {
            provider: body.provider || null,
            name: body.name || null,
            credit_limit: body.credit_limit || null,
            expiration: body.expiration ? new Date(body.expiration) : null,
            websocket_url: body.websocket_url || null,
            api_key: body.api_key,
            api_secret: body.api_secret || null,
            project_name: body.project_name || null,
            project_number: body.project_number || null,
            is_active: body.is_active !== false,
        },
    });
    return NextResponse.json({ status: true, data: token }, { status: 201 });
}

// ─── PUT: update token ──────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    if (!body.id) return NextResponse.json({ status: false, message: 'id required' }, { status: 400 });

    const token = await prisma.ia_tokens_keys.update({
        where: { id: Number(body.id) },
        data: {
            provider: body.provider ?? undefined,
            name: body.name ?? undefined,
            credit_limit: body.credit_limit ?? undefined,
            expiration: body.expiration ? new Date(body.expiration) : null,
            websocket_url: body.websocket_url ?? undefined,
            api_key: body.api_key ?? undefined,
            api_secret: body.api_secret ?? undefined,
            project_name: body.project_name ?? undefined,
            project_number: body.project_number ?? undefined,
            is_active: body.is_active !== undefined ? body.is_active : undefined,
        },
    });
    return NextResponse.json({ status: true, data: token });
}

// ─── DELETE: remove token ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await req.json();
    if (!id) return NextResponse.json({ status: false, message: 'id required' }, { status: 400 });
    await prisma.ia_tokens_keys.delete({ where: { id: Number(id) } });
    return NextResponse.json({ status: true });
}
