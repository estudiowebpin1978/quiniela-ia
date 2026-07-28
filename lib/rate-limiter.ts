/**
 * Rate Limiter using Supabase with in-memory fallback
 * Implements sliding window rate limiting with Redis-like behavior using Supabase
 * Falls back to local memory when Supabase is unavailable
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  totalHits: number
}

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  max: number
  /** Window in milliseconds */
  windowMs: number
  /** Key prefix for namespacing */
  prefix?: string
  /** Custom key generator */
  keyGenerator?: (identifier: string) => string
}

// In-memory fallback store (per-serverless-instance)
const localFallbackStore = new Map<string, { count: number; resetAt: number }>()
const LOCAL_MAX_ENTRIES = 10000

function cleanupLocalStore(): void {
  if (localFallbackStore.size > LOCAL_MAX_ENTRIES) {
    const now = Date.now()
    const entries = Array.from(localFallbackStore.entries())
    for (const [key, val] of entries) {
      if (now > val.resetAt) localFallbackStore.delete(key)
    }
  }
}

function checkLocalFallback(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now()
  const entry = localFallbackStore.get(identifier)

  if (!entry || now > entry.resetAt) {
    localFallbackStore.set(identifier, { count: 1, resetAt: now + options.windowMs })
    cleanupLocalStore()
    return {
      allowed: true,
      remaining: options.max - 1,
      resetAt: now + options.windowMs,
      totalHits: 1,
    }
  }

  entry.count++
  const allowed = entry.count <= options.max
  return {
    allowed,
    remaining: Math.max(0, options.max - entry.count),
    resetAt: entry.resetAt,
    totalHits: entry.count,
  }
}

/**
 * Rate limiter using Supabase as backing store
 * Uses a sliding window algorithm with atomic operations
 * Falls back to in-memory rate limiting when Supabase is unavailable
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { max: 20, windowMs: 300000 }
): Promise<RateLimitResult> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    // Supabase unavailable — use local memory fallback
    return checkLocalFallback(identifier, options)
  }

  const prefix = options.prefix || "ratelimit"
  const key = options.keyGenerator ? options.keyGenerator(identifier) : `${prefix}:${identifier}`
  const windowSec = Math.ceil(options.windowMs / 1000)
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - windowSec

  try {
    // Use a single atomic RPC call for the sliding window
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_window_start: windowStart,
      p_now: now,
      p_max: options.max,
      p_window_sec: windowSec
    })

    if (error) {
      console.error("[RateLimit] RPC error, falling back to local:", error.message)
      return checkLocalFallback(identifier, options)
    }

    const result = data?.[0]
    if (!result) {
      return checkLocalFallback(identifier, options)
    }

    return {
      allowed: result.allowed,
      remaining: Math.max(0, result.remaining),
      resetAt: result.reset_at * 1000,
      totalHits: result.total_hits
    }
  } catch (err) {
    console.error("[RateLimit] Error, falling back to local:", err)
    return checkLocalFallback(identifier, options)
  }
}

/**
 * Rate limit options for different endpoint types
 */
export const RATE_LIMIT_PRESETS = {
  /** Strict rate limit for prediction API */
  PREDICTION_API: { max: 30, windowMs: 60000, prefix: "prediction" } as RateLimitOptions,
  /** Moderate rate limit for general API */
  GENERAL_API: { max: 60, windowMs: 60000, prefix: "api" } as RateLimitOptions,
  /** Lenient rate limit for static assets */
  LENIENT: { max: 100, windowMs: 60000, prefix: "lenient" } as RateLimitOptions,
  /** Strict rate limit for auth endpoints */
  AUTH: { max: 10, windowMs: 300000, prefix: "auth" } as RateLimitOptions,
  /** Scraping endpoints */
  SCRAPING: { max: 5, windowMs: 300000, prefix: "scraping" } as RateLimitOptions,
}

/**
 * Middleware helper for Next.js API routes
 */
export function withRateLimit(
  options: RateLimitOptions = RATE_LIMIT_PRESETS.GENERAL_API
) {
  return async function rateLimitMiddleware(
    request: Request,
    getIdentifier: (req: Request) => string = (req) => 
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
      req.headers.get("x-real-ip") || 
      "unknown"
  ): Promise<{ allowed: boolean; headers: Record<string, string> }> {
    const identifier = getIdentifier(request)
    const result = await checkRateLimit(identifier, options)

    const headers = {
      "X-RateLimit-Limit": options.max.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
    }

    if (!result.allowed) {
      return { allowed: false, headers }
    }

    return { allowed: true, headers }
  }
}

/**
 * Simple in-memory rate limiter for development/testing
 * Does NOT persist across restarts - use only for local dev
 */
export function createMemoryRateLimiter(options: RateLimitOptions = { max: 20, windowMs: 300000 }) {
  const store = new Map<string, { count: number; resetAt: number }>()

  return {
    check: async (identifier: string): Promise<RateLimitResult> => {
      const now = Date.now()
      const entry = store.get(identifier)

      if (!entry || now > entry.resetAt) {
        store.set(identifier, { count: 1, resetAt: now + options.windowMs })
        return {
          allowed: true,
          remaining: options.max - 1,
          resetAt: now + options.windowMs,
          totalHits: 1
        }
      }

      entry.count++
      const allowed = entry.count <= options.max
      return {
        allowed,
        remaining: Math.max(0, options.max - entry.count),
        resetAt: entry.resetAt,
        totalHits: entry.count
      }
    },
    clear: () => store.clear(),
    size: () => store.size
  }
}