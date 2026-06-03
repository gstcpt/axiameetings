import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const isRedisEnabled = typeof window === 'undefined' && !!REDIS_URL && REDIS_URL !== 'none' && process.env.REDIS_ENABLED !== 'false';

let redisClient: Redis | null = null;
let isRedisConnected = false;
let warningLogged = false;

if (isRedisEnabled) {
    try {
        redisClient = new Redis(REDIS_URL!, {
            maxRetriesPerRequest: 1, // Fail fast so it fallback to DB immediately
            connectTimeout: 2000,
            retryStrategy(times) {
                // Retry every 10 seconds, but do not block app startup
                return Math.min(times * 1000, 10000);
            }
        });

        redisClient.on('connect', () => {
            isRedisConnected = true;
            warningLogged = false;
            console.log('✅ Connected to Redis cache layer.');
        });

        redisClient.on('error', (err) => {
            isRedisConnected = false;
            if (!warningLogged) {
                console.warn('⚠️ Redis offline. Caching & rate limiting falling back to local memory / database.');
                warningLogged = true;
            }
        });

        redisClient.on('end', () => {
            isRedisConnected = false;
        });
    } catch (e) {
        console.error('Failed to initialize Redis client:', e);
    }
}

export const redis = redisClient;

/**
 * Robust get-or-set caching wrapper utility.
 * Automatically falls back to fetching directly from DB/API if Redis is offline.
 */
export async function getOrSetCache<T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>
): Promise<T> {
    if (!redis || !isRedisConnected) {
        return fetchFn();
    }
    try {
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached) as T;
        }
        const data = await fetchFn();
        if (data !== undefined && data !== null) {
            await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
        }
        return data;
    } catch (err) {
        console.error(`Redis cache error for key "${key}":`, err);
        return fetchFn();
    }
}

/**
 * Check if the Redis cache is actively connected.
 */
export function isCacheConnected(): boolean {
    return isRedisConnected;
}
