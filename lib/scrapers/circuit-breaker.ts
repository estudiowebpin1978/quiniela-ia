/**
 * Circuit Breaker for scraper sources.
 *
 * Quarantines a source after 3 consecutive failures against consensus.
 * Prevents cascade failures when a website changes its HTML structure.
 *
 * States:
 *   - CLOSED (normal): source runs normally
 *   - OPEN (quarantined): source is skipped, cooldown timer active
 *   - HALF_OPEN: after cooldown, try once to see if source recovered
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

const CONSECUTIVE_FAILURES_THRESHOLD = 3
const QUARANTINE_DURATION_MS = 4 * 60 * 60 * 1000 // 4 hours

export interface SourceHealth {
  source: string
  consecutive_failures: number
  quarantined_until: string | null
  last_failure_at: string | null
  last_success_at: string | null
  total_failures: number
  total_successes: number
}

export interface CircuitBreakerState {
  isQuarantined: boolean
  consecutiveFailures: number
  quarantinedUntil: Date | null
}

// In-memory cache to avoid DB hits on every parser call
const healthCache = new Map<string, SourceHealth & { cachedAt: number }>()
const CACHE_TTL_MS = 60_000 // 1 minute

function getCachedHealth(source: string): (SourceHealth & { cachedAt: number }) | null {
  const cached = healthCache.get(source)
  if (!cached) return null
  const age = Date.now() - cached.cachedAt
  if (age > CACHE_TTL_MS) {
    healthCache.delete(source)
    return null
  }
  return cached
}

/**
 * Check if a source is quarantined (should be skipped).
 */
export async function isSourceQuarantined(source: string): Promise<CircuitBreakerState> {
  const cached = getCachedHealth(source)
  if (cached) {
    const now = new Date()
    const quarantinedUntil = cached.quarantined_until ? new Date(cached.quarantined_until) : null
    return {
      isQuarantined: quarantinedUntil !== null && quarantinedUntil > now,
      consecutiveFailures: cached.consecutive_failures,
      quarantinedUntil,
    }
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("source_health" as never)
      .select("*")
      .eq("source", source)
      .single()

    if (error || !data) {
      return { isQuarantined: false, consecutiveFailures: 0, quarantinedUntil: null }
    }

    const health = data as unknown as SourceHealth
    healthCache.set(source, { ...health, cachedAt: Date.now() })

    const now = new Date()
    const quarantinedUntil = health.quarantined_until ? new Date(health.quarantined_until) : null

    return {
      isQuarantined: quarantinedUntil !== null && quarantinedUntil > now,
      consecutiveFailures: health.consecutive_failures,
      quarantinedUntil,
    }
  } catch (e) {
    logger.error("circuit-breaker: check failed", { source, error: String(e) })
    return { isQuarantined: false, consecutiveFailures: 0, quarantinedUntil: null }
  }
}

/**
 * Record a source result (success or failure).
 * If 3 consecutive failures → quarantine the source.
 */
export async function recordSourceResult(
  source: string,
  success: boolean
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    // Upsert health record
    const { data: existing } = await supabase
      .from("source_health" as never)
      .select("*")
      .eq("source", source)
      .single()

    const prev = existing as unknown as SourceHealth | null
    const prevFailures = prev?.consecutive_failures ?? 0
    const totalFailures = (prev?.total_failures ?? 0) + (success ? 0 : 1)
    const totalSuccesses = (prev?.total_successes ?? 0) + (success ? 1 : 0)

    let newConsecutiveFailures: number
    let quarantineUntil: string | null = null

    if (success) {
      newConsecutiveFailures = 0
      quarantineUntil = null
    } else {
      newConsecutiveFailures = prevFailures + 1
      if (newConsecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
        const quarantineEnd = new Date(Date.now() + QUARANTINE_DURATION_MS)
        quarantineUntil = quarantineEnd.toISOString()
        logger.warn("circuit-breaker: SOURCE QUARANTINED", {
          source,
          consecutiveFailures: newConsecutiveFailures,
          quarantinedUntil: quarantineUntil,
        })
        // Discord alert on quarantine
        try {
          const { alertSourceQuarantined } = await import("@/lib/notifications/discord")
          await alertSourceQuarantined(source, newConsecutiveFailures, quarantineUntil)
        } catch { /* non-fatal */ }
      }
    }

    const upsertData = {
      source,
      consecutive_failures: newConsecutiveFailures,
      quarantined_until: quarantineUntil,
      last_failure_at: success ? (prev?.last_failure_at ?? null) : now,
      last_success_at: success ? now : (prev?.last_success_at ?? null),
      total_failures: totalFailures,
      total_successes: totalSuccesses,
      updated_at: now,
    }

    const { error } = await supabase
      .from("source_health" as never)
      .upsert(upsertData as never, { onConflict: "source" } as never)

    if (error) {
      logger.error("circuit-breaker: upsert failed", { source, error: error.message })
    }

    // Update cache
    healthCache.set(source, { ...upsertData, cachedAt: Date.now() } as unknown as SourceHealth & { cachedAt: number })
  } catch (e) {
    logger.error("circuit-breaker: record failed", { source, error: String(e) })
  }
}

/**
 * Get health status for all sources (for dashboard/monitoring).
 */
export async function getAllSourceHealth(): Promise<SourceHealth[]> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("source_health" as never)
      .select("*")
      .order("source")

    if (error) return []
    return (data as unknown as SourceHealth[]) || []
  } catch {
    return []
  }
}

/**
 * Manually unquarantine a source (admin override).
 */
export async function unquarantineSource(source: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase
      .from("source_health" as never)
      .update({
        quarantined_until: null,
        consecutive_failures: 0,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("source", source)

    healthCache.delete(source)
    logger.info("circuit-breaker: source unquarantined manually", { source })
  } catch (e) {
    logger.error("circuit-breaker: unquarantine failed", { source, error: String(e) })
  }
}
