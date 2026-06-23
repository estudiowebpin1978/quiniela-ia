/**
 * In-memory logging system for all scraping activities.
 * Stores logs in globalThis (survives across cold starts within same instance).
 * Optionally persists last 100 logs to Supabase `scrape_logs` table if it exists.
 */

export interface LogEntry {
  id: string
  timestamp: string
  action: 'scrape' | 'sync' | 'validate' | 'insert' | 'error' | 'retry'
  source?: string
  fecha?: string
  turno?: string
  drawsAdded: number
  drawsTotal: number
  duration: number
  status: 'OK' | 'WARNING' | 'ERROR'
  message: string
  error?: string
}

const MAX_IN_MEMORY = 500

function getStorage(): LogEntry[] {
  if (!globalThis.__scrapeLogs) {
    globalThis.__scrapeLogs = []
  }
  return globalThis.__scrapeLogs
}

function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${ts}-${rand}`
}

function getSupabaseCreds(): { url: string; key: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()
  if (!url || !key) return null
  return { url, key }
}

let tableExistsPromise: Promise<boolean> | null = null

async function checkScrapeLogsTable(): Promise<boolean> {
  if (tableExistsPromise) return tableExistsPromise
  tableExistsPromise = (async () => {
    const creds = getSupabaseCreds()
    if (!creds) return false
    try {
      const r = await fetch(
        `${creds.url}/rest/v1/scrape_logs?select=id&limit=1`,
        { headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` }, signal: AbortSignal.timeout(5000) }
      )
      return r.ok
    } catch {
      return false
    }
  })()
  return tableExistsPromise
}

async function persistToSupabase(entry: LogEntry): Promise<void> {
  const creds = getSupabaseCreds()
  if (!creds) return
  try {
    await fetch(`${creds.url}/rest/v1/scrape_logs`, {
      method: "POST",
      headers: {
        apikey: creds.key,
        Authorization: `Bearer ${creds.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: entry.id,
        timestamp: entry.timestamp,
        action: entry.action,
        source: entry.source ?? null,
        fecha: entry.fecha ?? null,
        turno: entry.turno ?? null,
        draws_added: entry.drawsAdded,
        draws_total: entry.drawsTotal,
        duration: entry.duration,
        status: entry.status,
        message: entry.message,
        error: entry.error ?? null,
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Best-effort persistence; in-memory is the primary store
  }
}

/**
 * Log a scraping event. Fire-and-forget: returns immediately.
 */
export function logScrape(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  const logEntry: LogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    ...entry,
    drawsAdded: entry.drawsAdded ?? 0,
    drawsTotal: entry.drawsTotal ?? 0,
    duration: entry.duration ?? 0,
    status: entry.status ?? "OK",
  }

  const logs = getStorage()
  logs.unshift(logEntry)

  // Trim to max size
  if (logs.length > MAX_IN_MEMORY) {
    logs.length = MAX_IN_MEMORY
  }

  // Persist to Supabase in background (non-blocking)
  checkScrapeLogsTable().then(exists => {
    if (exists) persistToSupabase(logEntry)
  })
}

/**
 * Get the most recent log entries (from in-memory).
 */
export function getRecentLogs(limit: number = 50): LogEntry[] {
  return getStorage().slice(0, limit)
}

/**
 * Compute aggregate stats from in-memory logs.
 */
export function getLogStats(): {
  totalScrapes: number
  successRate: number
  avgDuration: number
  lastError: LogEntry | null
  errorsLast24h: number
} {
  const logs = getStorage()
  const scrapeLogs = logs.filter(l => l.action === 'scrape' || l.action === 'sync')
  const okCount = scrapeLogs.filter(l => l.status === 'OK').length
  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000

  const errors24h = logs.filter(
    l => l.status === 'ERROR' && new Date(l.timestamp).getTime() >= oneDayAgo
  )
  const lastError = logs.find(l => l.status === 'ERROR') || null

  const totalDuration = scrapeLogs.reduce((sum, l) => sum + l.duration, 0)

  return {
    totalScrapes: scrapeLogs.length,
    successRate: scrapeLogs.length > 0 ? okCount / scrapeLogs.length : 1,
    avgDuration: scrapeLogs.length > 0 ? totalDuration / scrapeLogs.length : 0,
    lastError,
    errorsLast24h: errors24h.length,
  }
}

/**
 * Remove old logs from in-memory storage.
 */
export function clearOldLogs(olderThanDays: number = 7): void {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  const logs = getStorage()
  const filtered = logs.filter(l => new Date(l.timestamp).getTime() >= cutoff)
  logs.length = 0
  logs.push(...filtered)
}

// Extend globalThis type for TypeScript
declare global {
  var __scrapeLogs: LogEntry[] | undefined
}
