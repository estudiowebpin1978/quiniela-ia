/**
 * Upstash Redis — Serverless Redis client with Supabase fallback.
 *
 * Architecture:
 *   Request → Upstash Redis (edge, ~1ms) → Supabase app_cache (~50ms) → DB query (~200ms)
 *
 * If Redis is unavailable or env vars are missing, falls back silently to Supabase cache.
 *
 * Env vars needed:
 *   UPSTASH_REDIS_REST_URL — from Upstash console
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console
 */

import { Redis } from "@upstash/redis"

// ─── Lazy-initialized Redis client ───────────────────────────────────────────

let redisClient: Redis | null = null

function getRedis(): Redis | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/"/g, "").trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").replace(/"/g, "").trim()

  if (!url || !token) return null

  if (!redisClient) {
    redisClient = new Redis({ url, token })
  }
  return redisClient
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RedisCacheEntry<T = unknown> {
  value: T
  expiresAt: number
}

/**
 * Get a cached value from Redis. Returns null if missing or expired.
 */
export async function redisGet<T = unknown>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const raw = await redis.get<string>(`qi:${key}`)
    if (!raw) return null

    const entry = JSON.parse(raw) as RedisCacheEntry<T>
    if (Date.now() > entry.expiresAt) {
      // Expired — delete lazily
      redis.del(`qi:${key}`).catch(() => {})
      return null
    }
    return entry.value
  } catch (e) {
    // Redis unavailable — silent fallback
    return null
  }
}

/**
 * Set a value in Redis with TTL (in seconds).
 */
export async function redisSet<T = unknown>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const entry: RedisCacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    }
    await redis.set(`qi:${key}`, JSON.stringify(entry), { ex: ttlSeconds })
  } catch {
    // Redis unavailable — silent failure
  }
}

/**
 * Delete a key from Redis.
 */
export async function redisDel(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    await redis.del(`qi:${key}`)
  } catch {
    // silent
  }
}

/**
 * Clear all keys matching a prefix (for cache invalidation).
 */
export async function redisClearPrefix(prefix: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    // Upstash doesn't support SCAN natively via REST — use keys pattern
    const keys = await redis.keys(`qi:${prefix}*`)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch {
    // silent
  }
}

/**
 * Check if Redis is configured and reachable.
 */
export async function isRedisAvailable(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false

  try {
    await redis.ping()
    return true
  } catch {
    return false
  }
}
