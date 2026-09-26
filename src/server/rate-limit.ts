import "server-only";
/**
 * Fixed-window rate limiting. Uses Redis when REDIS_URL is configured (shared
 * across instances); otherwise an in-process map, which is adequate for a
 * single-node deployment and local development.
 */
import type Redis from "ioredis";
import { E } from "./http";

type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as { __omRateMem?: Map<string, Bucket>; __omRedis?: Redis | null };

function getRedis(): Redis | null {
  if (g.__omRedis !== undefined) return g.__omRedis;
  g.__omRedis = null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisCtor = require("ioredis") as typeof Redis;
    const client = new RedisCtor(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    client.on("error", () => {
      /* degrade to in-memory */
    });
    g.__omRedis = client;
  } catch {
    g.__omRedis = null;
  }
  return g.__omRedis;
}

export async function rateLimit(key: string, limit: number, windowSec = 60): Promise<boolean> {
  const windowMs = windowSec * 1000;
  const redis = getRedis();
  if (redis && redis.status === "ready") {
    try {
      const bucketKey = `om:rl:${key}:${Math.floor(Date.now() / windowMs)}`;
      const count = await redis.incr(bucketKey);
      if (count === 1) await redis.pexpire(bucketKey, windowMs);
      return count <= limit;
    } catch {
      /* fall through */
    }
  }
  const mem = (g.__omRateMem ??= new Map());
  const now = Date.now();
  let b = mem.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    mem.set(key, b);
  }
  b.count += 1;
  if (mem.size > 50_000) {
    for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
  }
  return b.count <= limit;
}

/** Throws a 429 ApiError when the limit is exceeded. */
export async function enforceRateLimit(key: string, limit: number, windowSec = 60, message?: string) {
  if (!(await rateLimit(key, limit, windowSec))) throw E.rateLimited(message);
}
