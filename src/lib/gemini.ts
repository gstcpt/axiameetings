/**
 * AI Provider Utility — DB-first key management with Gemini + Groq failover
 *
 * Key priority:
 *   1. Active Gemini keys from ia_tokens_keys table (provider = 'gemini')
 *   2. Active Groq key from ia_tokens_keys table (provider = 'groq')
 *   3. Fallback to .env if DB has no keys configured
 *
 * Usage is tracked in ia_token_usage table per feature per call.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { prisma } from '@/lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DbKey { id: number; key: string }

// ─── Load keys from DB (with .env fallback) ───────────────────────────────────
async function loadGeminiKeys(): Promise<DbKey[]> {
    try {
        const rows = await prisma.ia_tokens_keys.findMany({
            where: { provider: 'gemini', is_active: true },
            orderBy: { id: 'asc' },
            select: { id: true, api_key: true },
        });
        if (rows.length > 0) return rows.map(r => ({ id: r.id, key: r.api_key }));
    } catch { /* DB not ready yet — fall through to .env */ }

    // .env fallback
    const keys: DbKey[] = [];
    if (process.env.GEMINI_API_KEY) keys.push({ id: -1, key: process.env.GEMINI_API_KEY });
    for (let i = 2; i <= 10; i++) {
        const k = process.env[`GEMINI_API_KEY_${i}`];
        if (k) keys.push({ id: -(i), key: k });
    }
    return keys;
}

async function loadGroqKey(): Promise<DbKey | null> {
    try {
        const row = await prisma.ia_tokens_keys.findFirst({
            where: { provider: 'groq', is_active: true },
            orderBy: { id: 'asc' },
            select: { id: true, api_key: true },
        });
        if (row) return { id: row.id, key: row.api_key };
    } catch { /* fall through */ }

    const envKey = process.env.GROQ_API_KEY;
    return envKey ? { id: -99, key: envKey } : null;
}

// ─── Usage tracking ───────────────────────────────────────────────────────────
async function trackUsage(tokenId: number, feature: string, success: boolean): Promise<void> {
    if (tokenId < 0) return; // .env fallback keys — don't track
    try {
        await prisma.ia_token_usage.create({
            data: { token_id: tokenId, feature, success },
        });
    } catch { /* non-critical */ }
}

// ─── Gemini model chain ───────────────────────────────────────────────────────
const GEMINI_MODELS = [
    'gemini-2.0-flash',   // 200 req/day per key — primary
    'gemini-2.5-flash',   // 20  req/day per key — emergency fallback
];

const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
];

// ─── Error helpers ────────────────────────────────────────────────────────────
function isQuotaExhausted(msg: string): boolean {
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('limit: 0') || msg.includes('PerDay') || msg.includes('quota');
}
function isModelUnavailable(msg: string): boolean {
    return msg.includes('404') || msg.includes('not found') || msg.includes('not supported');
}
function isServiceUnavailable(msg: string): boolean {
    return msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('Internal error');
}
function parseRetryDelay(msg: string): number {
    const m = msg.match(/retryDelay.*?(\d+(?:\.\d+)?)s/i) || msg.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
    return m ? Math.ceil(parseFloat(m[1])) * 1000 : 12_000;
}

// ─── Gemini: try one model ────────────────────────────────────────────────────
async function tryGeminiModel(
    client: GoogleGenerativeAI,
    modelName: string,
    prompt: string,
    maxOutputTokens?: number,
): Promise<string> {
    const model = client.getGenerativeModel({
        model: modelName,
        ...(maxOutputTokens ? { generationConfig: { maxOutputTokens } } : {}),
    });
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (err: any) {
            const msg: string = err?.message || '';
            if (isModelUnavailable(msg)) throw err;
            if (!isQuotaExhausted(msg) && !isServiceUnavailable(msg)) throw err;
            if (attempt === 0 && !isServiceUnavailable(msg)) {
                const delay = parseRetryDelay(msg);
                console.warn(`[Gemini:${modelName}] Rate limited — waiting ${Math.round(delay / 1000)}s…`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
    throw new Error('unreachable');
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Generate text with DB-first key loading, automatic failover, and usage tracking.
 * @param feature  Name of the AI feature (e.g. 'chat', 'ai-summary', 'polish-text')
 */
export async function generateWithRetry(
    prompt: string,
    options?: { maxOutputTokens?: number; feature?: string },
): Promise<string> {
    const feature = options?.feature || 'unknown';
    let lastErr: any;

    // ── Phase 1: Gemini ───────────────────────────────────────────────────────
    const geminiKeys = await loadGeminiKeys();
    if (geminiKeys.length > 0) {
        for (const modelName of GEMINI_MODELS) {
            for (const dbKey of geminiKeys) {
                const client = new GoogleGenerativeAI(dbKey.key);
                try {
                    console.log(`[Gemini] key#${dbKey.id} model:${modelName}`);
                    const result = await tryGeminiModel(client, modelName, prompt, options?.maxOutputTokens);
                    await trackUsage(dbKey.id, feature, true);
                    return result;
                } catch (err: any) {
                    lastErr = err;
                    const msg: string = err?.message || '';
                    await trackUsage(dbKey.id, feature, false);
                    if (isModelUnavailable(msg)) {
                        console.warn(`[Gemini] ${modelName} unavailable — skipping model`);
                        break;
                    }
                    if (isQuotaExhausted(msg) || isServiceUnavailable(msg)) {
                        console.warn(`[Gemini] key#${dbKey.id}/${modelName} exhausted — rotating`);
                        continue;
                    }
                    throw err; // unexpected error
                }
            }
        }
    }

    // ── Phase 2: Groq fallback ────────────────────────────────────────────────
    const groqKey = await loadGroqKey();
    if (groqKey) {
        const groqClient = new Groq({ apiKey: groqKey.key });
        console.log('[AI] Gemini exhausted → Groq fallback');
        for (const model of GROQ_MODELS) {
            try {
                const completion = await groqClient.chat.completions.create({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: options?.maxOutputTokens ?? 4096,
                    temperature: 0.7,
                });
                const text = completion.choices?.[0]?.message?.content?.trim();
                if (!text) throw new Error('Empty Groq response');
                await trackUsage(groqKey.id, feature, true);
                return text;
            } catch (err: any) {
                await trackUsage(groqKey.id, feature, false);
                console.warn(`[Groq:${model}] failed: ${err?.message?.substring(0, 80)}`);
                if (GROQ_MODELS.indexOf(model) < GROQ_MODELS.length - 1) continue;
                lastErr = err;
            }
        }
    }

    throw lastErr || new Error('ALL_PROVIDERS_EXHAUSTED');
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function parseJsonResponse<T = any>(text: string): T {
    const clean = text
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/\s*```$/m, '')
        .trim();
    return JSON.parse(clean) as T;
}

export function geminiErrorMessage(error: any): string {
    const msg: string = error?.message || String(error);
    if (msg === 'ALL_PROVIDERS_EXHAUSTED') return 'AI quota exhausted on all providers. Try again after midnight UTC.';
    if (isQuotaExhausted(msg)) return 'AI service temporarily overloaded — please retry in a moment';
    if (msg.includes('503')) return 'AI service temporarily unavailable — please retry';
    if (msg.includes('404')) return 'No AI model available for this API key';
    if (msg.includes('API_KEY') || msg.includes('401')) return 'AI API key not configured or invalid';
    return 'AI request failed — please try again';
}

// ─── Chat-specific: Groq streaming (used by /api/chat) ───────────────────────
/**
 * Get an active Groq client from DB (or .env fallback) for streaming.
 * Returns { client, tokenId } so usage can be tracked after streaming.
 */
export async function getGroqForChat(): Promise<{ client: Groq; tokenId: number } | null> {
    const groqKey = await loadGroqKey();
    if (!groqKey) return null;
    return { client: new Groq({ apiKey: groqKey.key }), tokenId: groqKey.id };
}

export { trackUsage };
