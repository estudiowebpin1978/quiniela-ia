const KEY = "__quinielaMlCache"
const TTL = 1800000

interface CacheEntry {
  modelos: any[]
  timestamp: number
  turno: string
}

/**
 * In-memory cache for ML models.
 * NOTE: In serverless (Vercel), globalThis does NOT persist across invocations.
 * Each cold start gets a fresh globalThis. This cache only helps during
 * warm invocations (same process handles multiple requests).
 * For cold starts, models are loaded from Supabase every time.
 */
function getStore(): Record<string, CacheEntry> {
  const g = globalThis as any
  if (!g[KEY]) g[KEY] = {}
  return g[KEY]
}

export function getModelos(turno: string): any[] | null {
  try {
    const entry = getStore()[turno]
    if (!entry) return null
    if (Date.now() - entry.timestamp > TTL) {
      delete getStore()[turno]
      return null
    }
    return entry.modelos
  } catch {
    return null
  }
}

export function setModelos(turno: string, modelos: any[]): void {
  try {
    getStore()[turno] = { modelos, timestamp: Date.now(), turno }
  } catch {}
}

/** Clear all cached models */
export function clearCache(): void {
  try {
    const g = globalThis as any
    if (g[KEY]) g[KEY] = {}
  } catch {}
}
