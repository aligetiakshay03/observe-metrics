/**
 * Distributed rate limiting backed by Redis (falls back to in-memory when
 * REDIS_URL is not configured, e.g. local dev without the docker stack).
 */
import type Redis from "ioredis";

type Bucket = { count: number; resetAt: number };

const globalForLimiter = globalThis as unknown as {
  __omRateMem?: Map<string, Bucket>;
  __omRedis?: Redis | null;
};

function getRedis(): Redis | null {
  if (globalForLimiter.__omRedis !== undefined) return globalForLimiter.__omRedis;
  globalForLimiter.__omRedis = null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // Lazy require so the app can boot without ioredis installed in edge cases.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisCtor = require("ioredis") as typeof Redis;
    globalForLimiter.__omRedis = new RedisCtor(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
    });
    globalForLimiter.__omRedis.on("error", () => {
      /* swallow — rate limiter degrades to in-memory */
    });
  } catch {
    globalForLimiter.__omRedis = null;
  }
  return globalForLimiter.__omRedis;
}

function memBucket(key: string): Bucket {
  const mem = (globalForLimiter.__omRateMem ??= new Map());
  const b = mem.get(key);
  if (b && b.resetAt > Date.now()) return b;
  const fresh = { count: 0, resetAt: Date.now() + 60_000 };
  mem.set(key, fresh);
  return fresh;
}

/**
 * Fixed-window limiter. Returns true when allowed, false when the caller has
 * exceeded `limit` requests per `windowSec` seconds.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec = 60,
): Promise<boolean> {
  const redis = getRedis();
  const windowMs = windowSec * 1000;

  if (redis) {
    try {
      const bucketKey = `om:rl:${key}:${Math.floor(Date.now() / windowMs)}`;
      const count = await redis.incr(bucketKey);
      if (count === 1) await redis.pexpire(bucketKey, windowMs);
      return count <= limit;
    } catch {
      // fall through to in-memory
    }
  }

  const b = memBucket(key);
  b.count += 1;
  return b.count <= limit;
}

/** Best-effort client identity for rate limiting. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
