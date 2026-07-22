/**
 * Pre-prediction sync orchestrator.
 * Must be called BEFORE any prediction to ensure the DB is up to date.
 * Designed to complete within 15 seconds (Vercel timeout).
 */

import { esDiaSinSorteo, esSabadoSinPrevia, esFeriado } from "@/lib/feriados"
import { logScrape, logScrape as logSync } from "./logger"

export interface SyncResult {
  synced: boolean
  newDraws: number
  validated: boolean
  errors: string[]
  lastDraw: { date: string; turno: string } | null
  duration: number
  details: {
    previa: { exists: boolean; latest: string | null; scraped: boolean }
    primera: { exists: boolean; latest: string | null; scraped: boolean }
    matutina: { exists: boolean; latest: string | null; scraped: boolean }
    vespertina: { exists: boolean; latest: string | null; scraped: boolean }
    nocturna: { exists: boolean; latest: string | null; scraped: boolean }
  }
}

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"] as const
type Turno = (typeof TURNOS)[number]

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

const TIMEOUT = 12000 // 12s internal budget (leaves 3s buffer for Vercel 15s limit)
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function fechaArgentina(): { fechaStr: string; diaSemana: number; fUrl: string } {
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

// ── Cache ──────────────────────────────────────────────────────────
interface CacheEntry {
  result: SyncResult
  expiresAt: number
}

function getCacheKey(targetDate: string): string {
  return `sync:${targetDate}`
}

function getCached(key: string): SyncResult | null {
  if (!globalThis.__syncCache) globalThis.__syncCache = {}
  const entry = globalThis.__syncCache[key]
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    delete globalThis.__syncCache[key]
    return null
  }
  return entry.result
}

function setCache(key: string, result: SyncResult): void {
  if (!globalThis.__syncCache) globalThis.__syncCache = {}
  globalThis.__syncCache[key] = { result, expiresAt: Date.now() + CACHE_TTL_MS }
}

// ── Supabase helpers ───────────────────────────────────────────────
async function getLatestDrawForTurno(
  turno: Turno
): Promise<{ date: string; turno: string } | null> {
  try {
    const r = await fetch(
      `${SB()}/rest/v1/draws?turno=eq.${turno}&select=date,turno&order=date.desc&limit=1`,
      {
        headers: { apikey: SK(), Authorization: `Bearer ${SK()}` },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!r.ok) return null
    const rows = await r.json()
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  } catch {
    return null
  }
}

async function hasDrawForDate(fechaISO: string, turno: string): Promise<boolean> {
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

async function saveDraw(
  fechaISO: string,
  turno: string,
  nums: number[],
  source: string
): Promise<boolean> {
  const r = await fetch(`${SB()}/rest/v1/draws`, {
    method: "POST",
    headers: {
      apikey: SK(),
      Authorization: `Bearer ${SK()}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ date: fechaISO, turno, numbers: nums, source }),
  })
  return r.ok
}

// ── Scraping ───────────────────────────────────────────────────────
async function scrapeTurnoOficial(fechaISO: string, turno: string): Promise<number[]> {
  const TURNO_ORDER = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
  const refDate = new Date("2026-06-08T12:00:00Z")
  const targetDate = new Date(fechaISO + "T12:00:00Z")
  const daysDiff = Math.round((targetDate.getTime() - refDate.getTime()) / 86400000)
  let weekdays = 0
  for (let i = 1; i <= daysDiff; i++) {
    const d = new Date(refDate.getTime() + i * 86400000)
    if (d.getDay() === 0) continue
    const ds = d.toISOString().slice(0, 10)
    if (esFeriado(ds)) continue
    weekdays++
  }
  const turnoIdx = TURNO_ORDER.indexOf(turno)
  if (turnoIdx < 0) return []
  const sorteoCode = 52492 + weekdays * 5 + turnoIdx

  try {
    const r = await fetch(
      "https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
        },
        body: `codigo=0080&juridiccion=51&sorteo=${sorteoCode}`,
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!r.ok) return []
    const html = await r.text()
    if (html.includes("No hay Sorteo")) return []

    const nums: number[] = []
    const rx = /<div class="pos">(\d{2})<\/div><div>(\d{4})<\/div>/g
    let mx: RegExpExecArray | null
    while ((mx = rx.exec(html)) !== null) {
      const n = parseInt(mx[2])
      if (n >= 0 && n <= 9999 && !nums.includes(n)) nums.push(n)
      if (nums.length >= 20) break
    }
    return nums
  } catch {
    return []
  }
}

async function scrapeTurnoFast(fechaUrl: string, turno: string): Promise<number[]> {
  const url = `https://quinielanacional1.com.ar/${fechaUrl}/${turno}`
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 3000))
    try {
      const html = await (
        await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
          signal: AbortSignal.timeout(10000),
        })
      ).text()

      const nacionalMark = '<p class="h3">Nacional</p>'
      const ciudadMark = '<p class="h3">Ciudad</p>'
      let sectionIdx = html.indexOf(nacionalMark)
      if (sectionIdx < 0) sectionIdx = html.indexOf(ciudadMark)
      if (sectionIdx < 0) sectionIdx = html.indexOf('class="veintena"')
      if (sectionIdx < 0) continue

      const afterSection = html.slice(sectionIdx)
      const veintenaIdx = afterSection.indexOf('class="veintena"')
      if (veintenaIdx < 0) continue

      const chunk = afterSection.slice(veintenaIdx, veintenaIdx + 4000)
      const nums: number[] = []
      const rx = /class="numero">(\d{3,4})<\/div>/g
      let mx: RegExpExecArray | null
      while ((mx = rx.exec(chunk)) !== null) {
        const n = parseInt(mx[1])
        if (n >= 0 && n <= 9999 && !nums.includes(n)) nums.push(n)
        if (nums.length >= 20) break
      }
      if (nums.length >= 5) return nums
    } catch {}
  }
  return []
}

async function scrapeTurno(
  fechaISO: string,
  fechaUrl: string,
  turno: string
): Promise<number[]> {
  let nums = await scrapeTurnoFast(fechaUrl, turno)
  if (nums.length < 5) {
    nums = await scrapeTurnoOficial(fechaISO, turno)
  }
  return nums
}

// ── Validation ─────────────────────────────────────────────────────
async function validateDraws(fechaISO: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []
  for (const turno of TURNOS) {
    try {
      const r = await fetch(
        `${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}&select=numbers&limit=1`,
        {
          headers: { apikey: SK(), Authorization: `Bearer ${SK()}` },
          signal: AbortSignal.timeout(5000),
        }
      )
      if (!r.ok) {
        errors.push(`Failed to query ${turno}: ${r.status}`)
        continue
      }
      const rows = await r.json()
      if (!Array.isArray(rows) || rows.length === 0) continue

      const numbers = rows[0]?.numbers
      if (!Array.isArray(numbers)) {
        errors.push(`${turno}: numbers is not an array`)
        continue
      }
      if (numbers.length < 5) {
        errors.push(`${turno}: only ${numbers.length} numbers (need >= 5)`)
      }
      const invalid = numbers.filter(
        (n: unknown) => typeof n !== "number" || n < 0 || n > 9999
      )
      if (invalid.length > 0) {
        errors.push(`${turno}: ${invalid.length} invalid numbers`)
      }
    } catch (e) {
      errors.push(`${turno}: validation error - ${String(e)}`)
    }
  }
  return { valid: errors.length === 0, errors }
}

// ── Main sync logic ────────────────────────────────────────────────
async function runSync(targetDate?: string, force: boolean = false): Promise<SyncResult> {
  const start = Date.now()

  const { fechaStr: fechaISO, diaSemana, fUrl } = targetDate
    ? (() => {
        const [yyyy, mm, dd] = targetDate.split("-")
        return {
          fechaStr: targetDate,
          diaSemana: new Date(`${targetDate}T12:00:00Z`).getDay(),
          fUrl: `${dd}-${mm}-${yyyy.slice(-2)}`,
        }
      })()
    : fechaArgentina()

  // Check cache (skip if forced)
  if (!force) {
    const cached = getCached(getCacheKey(fechaISO))
    if (cached) return cached
  }

  const isWeekendOrHoliday = esDiaSinSorteo(fechaISO, diaSemana)

  // If it's a day without draws and not forced, return early (synced by definition)
  if (isWeekendOrHoliday && !force) {
    const result: SyncResult = {
      synced: true,
      newDraws: 0,
      validated: true,
      errors: [],
      lastDraw: null,
      duration: Date.now() - start,
      details: Object.fromEntries(
        TURNOS.map(t => [t.toLowerCase(), { exists: false, latest: null, scraped: false }])
      ) as SyncResult["details"],
    }
    setCache(getCacheKey(fechaISO), result)
    return result
  }

  const errors: string[] = []
  let newDraws = 0
  const details: SyncResult["details"] = {} as SyncResult["details"]
  let lastDraw: { date: string; turno: string } | null = null

  for (const turno of TURNOS) {
    const key = turno.toLowerCase() as keyof SyncResult["details"]
    const alreadyExpired = Date.now() - start > TIMEOUT

    // Saturday has no Previa
    if (turno === "Previa" && esSabadoSinPrevia(diaSemana, turno)) {
      details[key] = { exists: false, latest: null, scraped: false }
      continue
    }

    // Check if draw exists for today
    const exists = alreadyExpired ? true : await hasDrawForDate(fechaISO, turno)

    // Get latest draw for this turno (historical)
    const latest = await getLatestDrawForTurno(turno)
    if (latest) {
      lastDraw = latest
    }

    if (exists) {
      details[key] = {
        exists: true,
        latest: latest?.date || null,
        scraped: false,
      }
      continue
    }

    // Need to scrape
    if (alreadyExpired) {
      errors.push(`${turno}: skipped (timeout approaching)`)
      details[key] = {
        exists: false,
        latest: latest?.date || null,
        scraped: false,
      }
      continue
    }

    try {
      const nums = await scrapeTurno(fechaISO, fUrl, turno)
      if (nums.length >= 5) {
        const saved = await saveDraw(fechaISO, turno, nums, "sync")
        if (saved) {
          newDraws++
          details[key] = {
            exists: true,
            latest: fechaISO,
            scraped: true,
          }
          logScrape({
            action: "scrape",
            source: "quinielanacional1.com.ar",
            fecha: fechaISO,
            turno,
            drawsAdded: 1,
            drawsTotal: nums.length,
            duration: Date.now() - start,
            status: "OK",
            message: `Scraped ${turno} for ${fechaISO}: ${nums.length} numbers`,
          })
        } else {
          errors.push(`${turno}: save failed`)
          details[key] = {
            exists: false,
            latest: latest?.date || null,
            scraped: false,
          }
        }
      } else {
        errors.push(`${turno}: only ${nums.length} numbers scraped`)
        details[key] = {
          exists: false,
          latest: latest?.date || null,
          scraped: false,
        }
      }
    } catch (e) {
      errors.push(`${turno}: scrape error - ${String(e)}`)
      details[key] = {
        exists: false,
        latest: latest?.date || null,
        scraped: false,
      }
    }
  }

  // Validate
  let validated = true
  if (!isWeekendOrHoliday && Date.now() - start < TIMEOUT) {
    const v = await validateDraws(fechaISO)
    validated = v.valid
    errors.push(...v.errors)
  }

  const result: SyncResult = {
    synced: errors.length === 0,
    newDraws,
    validated,
    errors,
    lastDraw,
    duration: Date.now() - start,
    details,
  }

  logSync({
    action: "sync",
    fecha: fechaISO,
    drawsAdded: newDraws,
    drawsTotal: TURNOS.length,
    duration: result.duration,
    status: result.synced ? "OK" : "WARNING",
    message: result.synced
      ? `Sync OK for ${fechaISO} (${newDraws} new)`
      : `Sync partial for ${fechaISO}: ${errors.length} errors`,
  })

  setCache(getCacheKey(fechaISO), result)
  return result
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Sync before a prediction. Cached for 5 minutes.
 * Target date defaults to today in Argentina timezone.
 */
export async function syncBeforePrediction(targetDate?: string): Promise<SyncResult> {
  return runSync(targetDate, false)
}

/**
 * Force a full sync (ignores cache). Useful for manual triggers.
 */
export async function forceSyncAll(): Promise<SyncResult> {
  return runSync(undefined, true)
}

// Extend globalThis type for TypeScript
declare global {
  var __syncCache: Record<string, { result: SyncResult; expiresAt: number }> | undefined
}
