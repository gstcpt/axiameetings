import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    // Collect Gemini keys (mask all but first/last 4 chars)
    const geminiKeys: { index: number; masked: string; configured: boolean }[] = [];
    const rawKeys: string[] = [];

    if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
    for (let i = 2; i <= 10; i++) {
        const k = process.env[`GEMINI_API_KEY_${i}`];
        if (k) rawKeys.push(k);
    }

    rawKeys.forEach((key, i) => {
        geminiKeys.push({
            index: i + 1,
            masked: key.length > 8 ? `${key.slice(0, 6)}${'•'.repeat(key.length - 10)}${key.slice(-4)}` : '••••••••',
            configured: true,
        });
    });

    // Show empty slots up to 5
    for (let i = rawKeys.length + 1; i <= 5; i++) {
        geminiKeys.push({ index: i, masked: 'Not configured', configured: false });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const groq = {
        configured: !!groqKey,
        masked: groqKey
            ? `${groqKey.slice(0, 6)}${'•'.repeat(Math.max(0, groqKey.length - 10))}${groqKey.slice(-4)}`
            : 'Not configured',
    };

    // Quotas info (static — from documentation)
    const quotas = {
        gemini_2_0_flash: { perKeyPerDay: 200, unit: 'req/day' },
        gemini_2_5_flash: { perKeyPerDay: 20, unit: 'req/day' },
        groq_llama_70b: { perDay: 14400, unit: 'req/day' },
    };

    const totalGeminiDaily = rawKeys.length * quotas.gemini_2_0_flash.perKeyPerDay;
    const totalCapacity = totalGeminiDaily + (groqKey ? quotas.groq_llama_70b.perDay : 0);

    return NextResponse.json({
        status: true,
        data: {
            geminiKeys,
            groq,
            quotas,
            summary: {
                geminiKeyCount: rawKeys.length,
                totalGeminiDaily,
                groqConfigured: !!groqKey,
                totalCapacity,
            },
        },
    });
}
