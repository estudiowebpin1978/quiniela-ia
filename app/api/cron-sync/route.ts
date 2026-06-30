/**
 * Cron Sync endpoint — runs every 15 min via cron-job.org.
 * Auto-detects which turno to scrape based on current Argentina time,
 * or accepts explicit turno/force params.
 *
 * GET /api/cron-sync                → auto-detect turno
 * GET /api/cron-sync?turno=nocturna → sync specific turno
 * GET /api/cron-sync?force=true     → sync all turnos + fill 7-day gaps
 */

import { NextRequest, NextResponse } from "next/server"
import { esDiaSinSorteo, esSabadoSinPrevia } from "@/lib/feriados"
import { scrapeAllSources } from "@/lib/scraper/multi-source"
import { validateDraw } from "@/lib/scraper/validator"
import { logScrape, getRecentLogs } from "@/lib/scraper/logger"

const SB = () =>
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () =>
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"] as const
type Turno = (typeof TURNOS)[number]

const SCRAPE_WINDOWS: [Turno, number][] = [
  ["Previa", 10 * 60 + 15],
  ["Primera", 12 * 60 + 15],
  ["Matutina", 15 * 60 + 15],
  ["Vespertina", 18 * 60 + 15],
  ["Nocturna", 21 * 60 + 15],
]

const MAX_SYNC_RETRIES = 3
const GAP_FILL_DAYS = 7
const GAP_FILL_DAYS_NORMAL = 3

// ── Time helpers ────────────────────────────────────────────────────

function fechaArgentina(): {
  fechaStr: string
  diaSemana: number
  fUrl: string
} {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format()
  const [yyyy, mm, dd] = p.split("-")
  return {
    fechaStr: p,
    diaSemana: new Date(`${p}T12:00:00Z`).getDay(),
    fUrl: `${dd}-${mm}-${yyyy.slice(-2)}`,
  }
}

function fechaToParts(fechaISO: string) {
  const [yyyy, mm, dd] = fechaISO.split("-")
  return {
    fechaStr: fechaISO,
    diaSemana: new Date(`${fechaISO}T12:00:00Z`).getDay(),
    fUrl: `${dd}-${mm}-${yyyy.slice(-2)}`,
  }
}

function nowArgentinaMinutes(): number {
  const str = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format()
  const [h, m] = str.split(":").map(Number)
  return h * 60 + m
}

function detectTurno(): Turno | null {
  const current = nowArgentinaMinutes()
  for (const [turno, start] of SCRAPE_WINDOWS) {
    if (current >= start && current < start + 60) return turno
  }
  return null
}

function getNextScrapeTime(): string {
  const current = nowArgentinaMinutes()
  for (const [name, start] of SCRAPE_WINDOWS) {
    if (current < start) {
      const h = String(Math.floor(start / 60)).padStart(2, "0")
      const m = String(start % 60).padStart(2, "0")
      return `${name} at ${h}:${m}`
    }
  }
  return `Previa at 10:30 (tomorrow)`
}

// ── Supabase helpers ────────────────────────────────────────────────

async function hasDraw(fechaISO: string, turno: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}&select=id&limit=1`,
      {
        headers: { apikey: SK(), Authorization: `Bearer ${SK()}` },
        signal: AbortSignal.timeout(5000),
      }
    )
    const d = await r.json()
    return Array.isArray(d) && d.length > 0
  } catch {
    return false
  }
}

async function insertDraw(
  fechaISO: string,
  turno: string,
  numbers: number[],
  source: string
): Promise<boolean> {
  const r = await fetch(`${SB()}/rest/v1/draws`, {
    method: "POST",
    headers: {
      apikey: SK(),
      Authorization: `Bearer ${SK()}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ date: fechaISO, turno, numbers, source }),
  })
  return r.ok
}

async function countDraws(): Promise<number> {
  try {
    const r = await fetch(`${SB()}/rest/v1/draws?select=count`, {
      headers: {
        apikey: SK(),
        Authorization: `Bearer ${SK()}`,
        Range: "0-0",
      },
      signal: AbortSignal.timeout(5000),
    })
    const total = r.headers.get("content-range")?.split("/")[1]
    return total ? parseInt(total, 10) : 0
  } catch {
    return 0
  }
}

async function getDrawDatesForTurno(
  turno: string
): Promise<string[]> {
  try {
    const r = await fetch(
      `${SB()}/rest/v1/draws?turno=eq.${turno}&select=date&order=date.desc&limit=30`,
      {
        headers: { apikey: SK(), Authorization: `Bearer ${SK()}` },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!r.ok) return []
    const rows = await r.json()
    return Array.isArray(rows) ? rows.map((r: any) => r.date) : []
  } catch {
    return []
  }
}

// ── Core sync ───────────────────────────────────────────────────────

interface SyncOutcome {
  synced: boolean
  newDraw: boolean
  validated: boolean
  errors: string[]
  source: string
  numbers: number[]
}

async function syncTurno(
  fechaISO: string,
  fUrl: string,
  turno: Turno
): Promise<SyncOutcome> {
  const errors: string[] = []

  if (await hasDraw(fechaISO, turno)) {
    return {
      synced: true,
      newDraw: false,
      validated: true,
      errors: [],
      source: "existing",
      numbers: [],
    }
  }

  let result = null
  for (let attempt = 1; attempt <= MAX_SYNC_RETRIES; attempt++) {
    result = await scrapeAllSources(fechaISO, turno.toLowerCase())
    if (result.numbers.length >= 5) break
    if (attempt < MAX_SYNC_RETRIES) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }

  if (!result || result.numbers.length < 5) {
    const msg = `${turno}: scrape failed after ${MAX_SYNC_RETRIES} attempts`
    errors.push(msg)
    logScrape({
      action: "error",
      fecha: fechaISO,
      turno,
      drawsAdded: 0,
      drawsTotal: 0,
      duration: 0,
      status: "ERROR",
      message: msg,
    })
    return {
      synced: false,
      newDraw: false,
      validated: false,
      errors,
      source: "none",
      numbers: [],
    }
  }

  const validationErrors = validateDraw(fechaISO, turno.toLowerCase(), result.numbers)
  if (validationErrors.length > 0) {
    errors.push(...validationErrors.map((e) => `${turno}: ${e}`))
  }

  const saved = await insertDraw(fechaISO, turno, result.numbers, result.source)
  if (!saved) {
    errors.push(`${turno}: insert failed`)
    return {
      synced: false,
      newDraw: false,
      validated: false,
      errors,
      source: result.source,
      numbers: result.numbers,
    }
  }

  logScrape({
    action: "sync",
    source: result.source,
    fecha: fechaISO,
    turno,
    drawsAdded: 1,
    drawsTotal: 1,
    duration: result.duration,
    status: validationErrors.length === 0 ? "OK" : "WARNING",
    message: `Synced ${turno} for ${fechaISO}: ${result.numbers.length} numbers from ${result.source}`,
  })

  return {
    synced: errors.length === 0,
    newDraw: true,
    validated: validationErrors.length === 0,
    errors,
    source: result.source,
    numbers: result.numbers,
  }
}

// ── Gap fill ────────────────────────────────────────────────────────

async function fillGaps(
  fechaISO: string,
  maxDays: number
): Promise<{ filled: number; errors: string[] }> {
  let filled = 0
  const errors: string[] = []

  // Also check TODAY (d=0) — scraper might have failed earlier when site wasn't ready yet
  for (let d = 0; d <= maxDays; d++) {
    const f = new Date()
    f.setDate(f.getDate() - d)
    const fechaStr = f.toISOString().split("T")[0]
    const { diaSemana, fUrl } = fechaToParts(fechaStr)

    if (esDiaSinSorteo(fechaStr, diaSemana)) continue

    for (const turno of TURNOS) {
      if (turno === "Previa" && esSabadoSinPrevia(diaSemana, turno)) continue
      if (await hasDraw(fechaStr, turno)) continue

      // For today, only scrape turnos that already started (current time > draw time)
      if (d === 0) {
        const nowMin = nowArgentinaMinutes()
        const turnoMinutes: Record<string, number> = {
          Previa: 10 * 60, Primera: 12 * 60, Matutina: 15 * 60, Vespertina: 18 * 60, Nocturna: 21 * 60
        }
        if (nowMin < (turnoMinutes[turno] || 0) + 15) continue // wait 15 min after draw time
      }

      const result = await syncTurno(fechaStr, fUrl, turno)
      if (result.newDraw) filled++
      if (result.errors.length > 0) errors.push(...result.errors)
    }
  }

  return { filled, errors }
}

// ── Auth ────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET
  return !!(secret && expected && secret === expected)
}

// ── Handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const start = Date.now()
  const force = req.nextUrl.searchParams.get("force") === "true"
  const turnoParam = req.nextUrl.searchParams.get("turno")?.toLowerCase() || ""

  const { fechaStr: fechaISO, diaSemana, fUrl } = fechaArgentina()

  if (!force && esDiaSinSorteo(fechaISO, diaSemana)) {
    return NextResponse.json({
      ok: true,
      message: "Sin sorteos",
      fecha: fechaISO,
      synced: true,
      newDraws: 0,
      validated: true,
      duration: Date.now() - start,
    })
  }

  // ── Determine turnos to sync ──
  let turnosToSync: Turno[]

  if (force) {
    turnosToSync = [...TURNOS]
  } else if (turnoParam) {
    const found = TURNOS.find((t) => t.toLowerCase() === turnoParam)
    if (!found) {
      return NextResponse.json(
        { error: `Turno invalido: ${turnoParam}. Validos: ${TURNOS.map((t) => t.toLowerCase()).join(", ")}` },
        { status: 400 }
      )
    }
    turnosToSync = [found]
  } else {
    const detected = detectTurno()
    if (detected) {
      turnosToSync = [detected]
    } else {
      // No turno in window — still run fillGaps below to catch missing draws
      turnosToSync = []
    }
  }

  // Filter out inapplicable turnos
  turnosToSync = turnosToSync.filter((t) => {
    if (t === "Previa" && esSabadoSinPrevia(diaSemana, t)) return false
    return true
  })

  // ── Sync each turno (skip if empty — fillGaps will handle missing draws) ──
  const results: Record<string, SyncOutcome> = {}
  let totalNewDraws = 0
  let allValidated = true
  const allErrors: string[] = []
  const sources: string[] = []

  for (const turno of turnosToSync) {
    const outcome = await syncTurno(fechaISO, fUrl, turno)
    results[turno.toLowerCase()] = outcome

    if (outcome.newDraw) totalNewDraws++
    if (!outcome.validated) allValidated = false
    if (outcome.errors.length > 0) allErrors.push(...outcome.errors)
    if (outcome.source && outcome.source !== "none" && outcome.source !== "existing") {
      sources.push(outcome.source)
    }
  }

  // ── Gap fill ──
  const maxGapDays = force ? GAP_FILL_DAYS : GAP_FILL_DAYS_NORMAL
  const gapResult = await fillGaps(fechaISO, maxGapDays)

  // ── Total draws count ──
  const totalDraws = await countDraws()

  // ── Recent logs ──
  const logs = getRecentLogs(20)

  const duration = Date.now() - start

  return NextResponse.json({
    ok: allErrors.length === 0,
    turno: turnosToSync.length === 1 ? turnosToSync[0].toLowerCase() : turnosToSync.map((t) => t.toLowerCase()),
    fecha: fechaISO,
    synced: allErrors.length === 0,
    newDraws: totalNewDraws,
    gapFilled: gapResult.filled,
    validated: allValidated,
    duration,
    totalDraws,
    sources: Array.from(new Set(sources)),
    errors: allErrors.length > 0 ? allErrors : undefined,
    logs,
  })
}
