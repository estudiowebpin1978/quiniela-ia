/**
 * Supabase-Backed Cache
 * Replaces globalThis caches that are lost on serverless cold starts.
 * Uses a simple key-value approach with TTL support.
 * Falls back to in-memory (globalThis) if Supabase is unavailable.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"

interface CacheEntry<T = any> {
  value: T
  expiresAt: number
}

const memoryStore = new Map<string, CacheEntry>()
const MEMORY_MAX = 200

/**
 * Get a cached value by key. Checks Supabase first, falls back to memory.
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  // 1. Check memory (instant)
  const memEntry = memoryStore.get(key)
  if (memEntry && Date.now() < memEntry.expiresAt) {
    return memEntry.value as T
  }
  memoryStore.delete(key)

  // 2. Check Supabase (persists across cold starts)
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("app_cache" as any)
      .select("value, expires_at")
      .eq("key", key)
      .single()

    if (error || !data) return null

    const expiresAt = new Date(data.expires_at).getTime()
    if (Date.now() >= expiresAt) {
      // Expired in DB, clean up
      supabase.from("app_cache" as any).delete().eq("key", key).then(() => {})
      return null
    }

    // Rehydrate memory cache
    memoryStore.set(key, { value: data.value, expiresAt })
    return data.value as T
  } catch {
    return null
  }
}

/**
 * Set a cached value with TTL. Writes to both memory and Supabase.
 */
export async function cacheSet<T = any>(key: string, value: T, ttlMs: number): Promise<void> {
  const expiresAt = Date.now() + ttlMs

  // 1. Write to memory (instant)
  if (memoryStore.size >= MEMORY_MAX) {
    // Evict oldest
    const oldest = memoryStore.keys().next().value
    if (oldest) memoryStore.delete(oldest)
  }
  memoryStore.set(key, { value, expiresAt })

  // 2. Write to Supabase (async, non-blocking)
  try {
    const supabase = getSupabaseAdmin()
    supabase.from("app_cache" as any).upsert({
      key,
      value,
      expires_at: new Date(expiresAt).toISOString(),
    }, { onConflict: "key" }).then(() => {})
  } catch {
    // Best-effort persistence
  }
}

/**
 * Delete a cached key from both memory and Supabase.
 */
export async function cacheDelete(key: string): Promise<void> {
  memoryStore.delete(key)
  try {
    const supabase = getSupabaseAdmin()
    supabase.from("app_cache" as any).delete().eq("key", key).then(() => {})
  } catch {}
}

/**
 * Clear all cached entries (memory only, Supabase will expire naturally).
 */
export function cacheClear(): void {
  memoryStore.clear()
}
