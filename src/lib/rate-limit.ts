import { NextRequest } from 'next/server';

interface RateLimiter {
    tokens: number;
    lastRefill: number;
}

const limiters = new Map<string, RateLimiter>();

// Periodic cleanup to avoid memory leak
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        // Clear limiters older than 10 minutes
        for (const [key, value] of limiters.entries()) {
            if (now - value.lastRefill > 10 * 60 * 1000) {
                limiters.delete(key);
            }
        }
    }, 5 * 60 * 1000); // run every 5 minutes
}

/**
 * Check if the request IP has exceeded its limit.
 * @param ip IP address of request
 * @param limit Max requests allowed in window
 * @param windowMs Time window in milliseconds
 * @returns true if allowed, false if rate limited
 */
export function rateLimit(ip: string, limit: number = 60, windowMs: number = 60000): boolean {
    const now = Date.now();
    let limiter = limiters.get(ip);

    if (!limiter) {
        limiter = { tokens: limit, lastRefill: now };
        limiters.set(ip, limiter);
    }

    const elapsed = now - limiter.lastRefill;
    const tokensToAdd = Math.floor((elapsed / windowMs) * limit);
    if (tokensToAdd > 0) {
        limiter.tokens = Math.min(limit, limiter.tokens + tokensToAdd);
        limiter.lastRefill = now;
    }

    if (limiter.tokens > 0) {
        limiter.tokens--;
        return true;
    }

    return false;
}

/**
 * Helper to extract IP address safely from request headers
 */
export function getIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) {
        return realIp.trim();
    }
    return (req as any).ip || '127.0.0.1';
}
