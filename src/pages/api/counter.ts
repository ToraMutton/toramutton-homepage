// 訪問者カウンター API
// Upstash Redis でカウントを管理
import type { APIRoute } from 'astro';
import { Redis } from '@upstash/redis';

export const prerender = false;

const getRedis = () => {
    const url = import.meta.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) return null;
    return new Redis({ url, token });
};

export const GET: APIRoute = async () => {
    const redis = getRedis();

    if (!redis) {
        // Redis未設定時はダミー値を返す（ローカル開発用）
        return new Response(JSON.stringify({ count: 7777 }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const count = await redis.incr('visitor_count');
        return new Response(JSON.stringify({ count }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.error('Redis error:', e);
        return new Response(JSON.stringify({ count: 0 }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
