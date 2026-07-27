/**
 * ML Model Cache
 * Uses Supabase-backed cache for persistence across cold starts.
 * Falls back to in-memory (globalThis) for warm invocations.
 */

import { cacheGet, cacheSet } from "@/lib/cache"

const CACHE_PREFIX = "ml:models:"
const TTL = 1800000 // 30 minutes

interface CacheEntry {
  modelos: any[]
  timestamp: number
  turno: string
}

// In-memory layer for instant access during warm invocations
const memStore = new Map<string, CacheEntry>()

export async function getModelos(turno: string): Promise<any[] | null> {
  // 1. Check memory (instant)
  const memEntry = memStore.get(turno)
  if (memEntry && Date.now() - memEntry.timestamp < TTL) {
    return memEntry.modelos
  }
  memStore.delete(turno)

  // 2. Check Supabase cache
  const cached = await cacheGet<CacheEntry>(CACHE_PREFIX + turno)
  if (cached) {
    memStore.set(turno, cached)
    return cached.modelos
  }

  return null
}

export async function setModelos(turno: string, modelos: any[]): Promise<void> {
  const entry: CacheEntry = { modelos, timestamp: Date.now(), turno }

  // Write to memory
  memStore.set(turno, entry)

  // Write to Supabase (async)
  await cacheSet(CACHE_PREFIX + turno, entry, TTL)
}

/** Clear all cached models */
export function clearCache(): void {
  memStore.clear()
}
