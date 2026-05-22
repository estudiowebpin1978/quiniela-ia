const KEY = "__quinielaMlCache"
const TTL = 1800000

interface CacheEntry {
  modelos: any[]
  timestamp: number
  turno: string
}

function getStore(): Record<string, CacheEntry> {
  const g = globalThis as any
  if (!g[KEY]) g[KEY] = {}
  return g[KEY]
}

export function getModelos(turno: string): any[] | null {
  const entry = getStore()[turno]
  if (!entry) return null
  if (Date.now() - entry.timestamp > TTL) {
    delete getStore()[turno]
    return null
  }
  return entry.modelos
}

export function setModelos(turno: string, modelos: any[]): void {
  getStore()[turno] = { modelos, timestamp: Date.now(), turno }
}
