/**
 * AI Provider Utility — Multi-provider, DB-first key management
 *
 * Supported providers (ia_tokens_keys.provider — case-insensitive):
 *   "gemini" / "Gemini"           → Google Gemini API
 *   "groq"   / "Groq"             → Groq API
 *   "openrouter" / "Open Router"  → OpenRouter API
 *
 * Priority orders:
 *   Chat (streaming/fallback) : Gemini → Groq → OpenRouter
 *   Generation (text)         : Groq   → Gemini → OpenRouter
 *
 * All keys loaded from ia_tokens_keys where is_active = true.
 * Usage tracked in ia_token_usage per call.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { prisma } from '@/lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DbKey {
    id: number;
    provider: string;
    key: string;
    websocket_url?: string | null;
}

// ─── Load active keys from DB (case-insensitive provider match) ───────────────
async function loadActiveKeys(provider: string): Promise<DbKey[]> {
    try {
        const rows = await prisma.ia_tokens_keys.findMany({
            where: {
                is_active: true,
                provider: { equals: provider, mode: 'insensitive' },
            },
            orderBy: { id: 'asc' },
            select: { id: true, api_key: true, websocket_url: true },
        });
        if (rows.length > 0) console.log(`[AI] ${provider}: ${rows.length} active key(s)`);
        return rows.map(r => ({ id: r.id, provider, key: r.api_key, websocket_url: r.websocket_url }));
    } catch (err: any) {
        console.error(`[AI] loadActiveKeys(${provider}) error:`, err?.message);
        return [];
    }
}

// ─── Usage tracking ───────────────────────────────────────────────────────────
export async function trackUsage(tokenId: number, feature: string, success: boolean, count: number = 1): Promise<void> {
    if (tokenId < 0) return;
    try {
        const records = Array.from({ length: count }, () => ({
            token_id: tokenId,
            feature,
            success,
        }));
        await prisma.ia_token_usage.createMany({
            data: records,
        });
    } catch { /* non-critical */ }
}

// ─── Error helpers ────────────────────────────────────────────────────────────
function isQuotaExhausted(msg: string): boolean {
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('limit: 0') || msg.includes('PerDay') || msg.includes('quota') ||
        msg.includes('rate_limit');
}
function isModelUnavailable(msg: string): boolean {
    return msg.includes('404') || msg.includes('not found') || msg.includes('not supported');
}
function isServiceUnavailable(msg: string): boolean {
    return msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('Internal error');
}
function isRetryable(msg: string): boolean {
    return isQuotaExhausted(msg) || isServiceUnavailable(msg);
}
function parseRetryDelay(msg: string): number {
    const m = msg.match(/retryDelay.*?(\d+(?:\.\d+)?)s/i) || msg.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
    return m ? Math.ceil(parseFloat(m[1])) * 1000 : 12_000;
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash'];

async function tryGeminiKey(dbKey: DbKey, prompt: string, maxOutputTokens?: number): Promise<string> {
    const client = new GoogleGenerativeAI(dbKey.key);
    for (const modelName of GEMINI_MODELS) {
        const model = client.getGenerativeModel({
            model: modelName,
            ...(maxOutputTokens ? { generationConfig: { maxOutputTokens } } : {}),
        });
        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (err: any) {
            const msg: string = err?.message || '';
            if (isModelUnavailable(msg)) break;
            throw err;
        }
    }
    throw new Error('GEMINI_ALL_MODELS_FAILED');
}

// ─── Groq ─────────────────────────────────────────────────────────────────────
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

async function tryGroqKey(dbKey: DbKey, prompt: string, maxOutputTokens?: number): Promise<string> {
    const client = new Groq({ apiKey: dbKey.key });
    for (const model of GROQ_MODELS) {
        try {
            const completion = await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxOutputTokens ?? 4096,
                temperature: 0.7,
            });
            const text = completion.choices?.[0]?.message?.content?.trim();
            if (!text) throw new Error('Empty Groq response');
            return text;
        } catch (err: any) {
            const msg: string = err?.message || '';
            console.warn(`[Groq:${model}] failed: ${msg.substring(0, 80)}`);
            if (GROQ_MODELS.indexOf(model) < GROQ_MODELS.length - 1) continue;
            throw err;
        }
    }
    throw new Error('GROQ_ALL_MODELS_FAILED');
}

// ─── OpenRouter ───────────────────────────────────────────────────────────────
const OPENROUTER_MODELS = [
    'meta-llama/llama-3.3-70b-instruct',
    'google/gemini-2.0-flash-001',
    'mistralai/mistral-7b-instruct',
];

async function tryOpenRouterKey(dbKey: DbKey, prompt: string, maxOutputTokens?: number): Promise<string> {
    const baseURL = dbKey.websocket_url || 'https://openrouter.ai/api/v1';
    for (const model of OPENROUTER_MODELS) {
        try {
            const res = await fetch(`${baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${dbKey.key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://axia-meetings.com',
                    'X-Title': 'Axia Meetings',
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: maxOutputTokens ?? 4096,
                    temperature: 0.7,
                }),
            });
            if (!res.ok) {
                const errText = await res.text();
                if (res.status === 404) { console.warn(`[OpenRouter:${model}] 404`); continue; }
                throw new Error(`OpenRouter ${res.status}: ${errText}`);
            }
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (!text) throw new Error('Empty OpenRouter response');
            return text;
        } catch (err: any) {
            const msg: string = err?.message || '';
            console.warn(`[OpenRouter:${model}] failed: ${msg.substring(0, 80)}`);
            if (OPENROUTER_MODELS.indexOf(model) < OPENROUTER_MODELS.length - 1) continue;
            throw err;
        }
    }
    throw new Error('OPENROUTER_ALL_MODELS_FAILED');
}

// ─── Generic try-provider helper ──────────────────────────────────────────────
async function tryProvider(dbKey: DbKey, prompt: string, feature: string, maxOutputTokens?: number): Promise<string> {
    const p = dbKey.provider.toLowerCase().replace(/\s+/g, '');
    if (p === 'gemini') return tryGeminiKey(dbKey, prompt, maxOutputTokens);
    if (p === 'groq') return tryGroqKey(dbKey, prompt, maxOutputTokens);
    if (p === 'openrouter') return tryOpenRouterKey(dbKey, prompt, maxOutputTokens);
    throw new Error(`Unknown provider: ${dbKey.provider}`);
}

// ─── Run through a list of providers in order ─────────────────────────────────
async function runProviders(
    providerOrder: string[],
    prompt: string,
    feature: string,
    maxOutputTokens?: number,
): Promise<string> {
    let lastErr: any;
    for (const provider of providerOrder) {
        const keys = await loadActiveKeys(provider);
        for (const dbKey of keys) {
            try {
                console.log(`[AI:${feature}] trying ${provider} key#${dbKey.id}`);
                const result = await tryProvider(dbKey, prompt, feature, maxOutputTokens);
                console.log(`[AI:${feature}] ${provider} key#${dbKey.id} SUCCEEDED`);
                await trackUsage(dbKey.id, feature, true, 1);
                return result;
            } catch (err: any) {
                lastErr = err;
                console.error(`[AI:${feature}] ${provider} key#${dbKey.id} FAILED:`, err.message || err);
                await trackUsage(dbKey.id, feature, false, 1);
                const msg: string = err?.message || '';
                if (isRetryable(msg) || msg.includes('_ALL_MODELS_FAILED')) {
                    console.warn(`[AI:${feature}] ${provider} key#${dbKey.id} exhausted — rotating`);
                    continue;
                }
                throw err; // unexpected error — don't swallow
            }
        }
    }
    throw lastErr || new Error('ALL_PROVIDERS_EXHAUSTED');
}

// ─── generateWithRetry — text generation ─────────────────────────────────────
// Priority: Groq → Gemini → OpenRouter
export async function generateWithRetry(
    prompt: string,
    options?: { maxOutputTokens?: number; feature?: string },
): Promise<string> {
    return runProviders(
        ['groq', 'gemini', 'openrouter', 'open router'],
        prompt,
        options?.feature || 'unknown',
        options?.maxOutputTokens,
    );
}

// ─── getChatResponse — chat fallback (non-streaming) ─────────────────────────
// Priority: Groq → Gemini → OpenRouter
export async function getChatResponse(
    prompt: string,
    options?: { maxOutputTokens?: number },
): Promise<string> {
    return runProviders(
        ['groq', 'gemini', 'openrouter', 'open router'],
        prompt,
        'chat',
        options?.maxOutputTokens,
    );
}

// ─── getStreamingClients — Groq streaming for chat ───────────────────────────
// Returns all active Groq keys in order
export async function getStreamingClients(): Promise<{ client: Groq; tokenId: number }[]> {
    const keys = await loadActiveKeys('groq');
    return keys.map(k => ({
        client: new Groq({ apiKey: k.key }),
        tokenId: k.id
    }));
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

export function aiErrorMessage(error: any): string {
    const msg: string = error?.message || String(error);
    if (msg === 'ALL_PROVIDERS_EXHAUSTED') return 'AI quota exhausted on all providers. Add more keys in AI Tokens settings.';
    if (isQuotaExhausted(msg)) return 'AI service temporarily overloaded — please retry in a moment';
    if (msg.includes('503')) return 'AI service temporarily unavailable — please retry';
    if (msg.includes('404')) return 'No AI model available for this API key';
    if (msg.includes('API_KEY') || msg.includes('401')) return 'AI API key not configured or invalid';
    return 'AI request failed — please try again';
}

export const geminiErrorMessage = aiErrorMessage;
