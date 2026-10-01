import "server-only";
/**
 * Fixed-window rate limiting. Uses Redis when REDIS_URL is configured (shared
 * across instances); otherwise an in-process map, which is adequate for a
 * single-node deployment and local development but resets on every deploy and
 * is not shared between replicas, so production requires it.
 */
import type Redis from "ioredis";
import { E } from "./http";
import { logger } from "./log";

const log = logger("rate-limit");

type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as { __omRateMem?: Map<string, Bucket>; __omRedis?: Redis | null; __omRedisWarned?: boolean };

function getRedis(): Redis | null {
  if (g.__omRedis !== undefined) return g.__omRedis;
  g.__omRedis = null;
  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      warnOnce("REDIS_URL is not set; rate limits are per-instance and reset on every deploy. Set REDIS_URL.");
    }
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisCtor = require("ioredis") as typeof Redis;
    const client = new RedisCtor(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    client.on("error", (e: Error) => {
      warnOnce(`Redis is unreachable (${e.message}); rate limits are falling back to per-instance counters.`);
    });
    g.__omRedis = client;
  } catch (e) {
    warnOnce(`Redis could not be initialised (${(e as Error).message}); rate limits are per-instance.`);
    g.__omRedis = null;
  }
  return g.__omRedis;
}

/** Rate limiting that silently degrades is worse than none, so say it once. */
function warnOnce(message: string) {
  if (g.__omRedisWarned) return;
  g.__omRedisWarned = true;
  log.warn(message);
}

/**
 * The connection is established asynchronously, so the first request after a
 * deploy can arrive before it is ready. With the offline queue disabled that
 * command fails immediately and the request is counted in-process only — a
 * gap exactly when brute-force protection matters most. Wait briefly for
 * readiness instead, and only give up if Redis is genuinely not coming up.
 */
function whenReady(client: Redis, timeoutMs = 2000): Promise<boolean> {
  if (client.status === "ready") return Promise.resolve(true);
  if (client.status === "end") return Promise.resolve(false);
  return new Promise((resolve) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      client.off("ready", onReady);
      resolve(false);
    }, timeoutMs);
    client.once("ready", onReady);
  });
}

export async function rateLimit(key: string, limit: number, windowSec = 60): Promise<boolean> {
  const windowMs = windowSec * 1000;
  const redis = getRedis();
  if (redis && (await whenReady(redis))) {
    try {
      const bucketKey = `om:rl:${key}:${Math.floor(Date.now() / windowMs)}`;
      const count = await redis.incr(bucketKey);
      if (count === 1) await redis.pexpire(bucketKey, windowMs);
      return count <= limit;
    } catch {
      warnOnce("Redis rate-limit command failed; using per-instance counters.");
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
