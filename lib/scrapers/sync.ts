/**
 * Pre-prediction sync orchestrator.
 * Must be called BEFORE any prediction to ensure the DB is up to date.
 * Designed to complete within 15 seconds (Vercel timeout).
 *
 * Flow: Check cache → Check DB exists → Scrape via orchestrator → Save to draws → Queue verification
 */

import { esDiaSinSorteo, esSabadoSinTurnos } from "@/lib/feriados"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { logScrape } from "./logger"
import { fetchWithFallback } from "./orchestrator"
import { SourceStats, TURNOS, TurnoType, SyncResult, GAME_ID } from "./types"

const TIMEOUT = 12000
const CACHE_TTL_MS = 5 * 60 * 1000

// ── Date helpers ─────────────────────────────────────────────────────
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

function parseTargetDate(targetDate: string): { fechaStr: string; diaSemana: number; fUrl: string } {
  const [yyyy, mm, dd] = targetDate.split("-")
  return {
    fechaStr: targetDate,
    diaSemana: new Date(`${targetDate}T12:00:00Z`).getDay(),
    fUrl: `${dd}-${mm}-${yyyy.slice(-2)}`,
  }
}

// ── Cache ────────────────────────────────────────────────────────────
import { cacheGet, cacheSet } from "@/lib/cache"

function getCacheKey(targetDate: string): string {
  return `sync:${targetDate}`
}

// ── Supabase helpers (via singleton) ─────────────────────────────────
async function hasDrawForDate(fechaISO: string, turno: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("draws")
      .select("id")
      .eq("date", fechaISO)
      .eq("turno", turno)
      .limit(1)

    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

async function getLatestDrawForTurno(
  turno: TurnoType
): Promise<{ date: string; turno: string } | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("draws")
      .select("date, turno")
      .eq("turno", turno)
      .order("date", { ascending: false })
      .limit(1)

    if (error) return null
    return Array.isArray(data) && data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

async function saveDraw(
  fechaISO: string,
  turno: TurnoType,
  nums: number[],
  source: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const jurisdiccion = ["Primera", "Nocturna"].includes(turno) ? "provincia" : "nacional"

    // Use .rpc() to avoid int4[] ↔ text[] type mismatch with PostgREST
    const { error } = await supabase.rpc("upsert_draw" as never, {
      p_date: fechaISO,
      p_turno: turno,
      p_numbers: nums,
      p_source: source,
      p_game_id: GAME_ID,
      p_jurisdiccion: jurisdiccion,
    } as never)

    return !error
  } catch {
    return false
  }
}

// ── Validation ───────────────────────────────────────────────────────
async function validateDraws(
  fechaISO: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []
  try {
    const supabase = getSupabaseAdmin()
    for (const turno of TURNOS) {
      const { data, error } = await supabase
        .from("draws")
        .select("numbers")
        .eq("date", fechaISO)
        .eq("turno", turno)
        .limit(1)

      if (error) {
        errors.push(`Failed to query ${turno}: ${error.message}`)
        continue
      }
      if (!Array.isArray(data) || data.length === 0) continue

      const numbers = data[0]?.numbers
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
    }
  } catch (e) {
    errors.push(`Validation error: ${String(e)}`)
  }
  return { valid: errors.length === 0, errors }
}

// ── Main sync logic ──────────────────────────────────────────────────
async function runSync(targetDate?: string, force: boolean = false): Promise<SyncResult> {
  const start = Date.now()

  const { fechaStr: fechaISO, diaSemana, fUrl } = targetDate
    ? parseTargetDate(targetDate)
    : fechaArgentina()

  if (!force) {
    const cached = await cacheGet<SyncResult>(getCacheKey(fechaISO))
    if (cached) return cached
  }

  const isWeekendOrHoliday = esDiaSinSorteo(fechaISO, diaSemana)

  if (isWeekendOrHoliday && !force) {
    const result: SyncResult = {
      synced: true,
      newDraws: 0,
      validated: true,
      errors: [],
      lastDraw: null,
      duration: Date.now() - start,
      details: Object.fromEntries(
        TURNOS.map((t) => [t, { exists: false, latest: null, scraped: false }])
      ) as SyncResult["details"],
    }
    await cacheSet(getCacheKey(fechaISO), result, CACHE_TTL_MS)
    return result
  }

  const errors: string[] = []
  let newDraws = 0
  const details: SyncResult["details"] = {} as SyncResult["details"]
  let lastDraw: { date: string; turno: string } | null = null
  const sourceStats: SourceStats = {}

  for (const turno of TURNOS) {
    const alreadyExpired = Date.now() - start > TIMEOUT

    // Skip Previa and Primera on Saturdays
    if (esSabadoSinTurnos(diaSemana, turno)) {
      details[turno] = { exists: false, latest: null, scraped: false }
      continue
    }

    const exists = alreadyExpired ? true : await hasDrawForDate(fechaISO, turno)
    const latest = await getLatestDrawForTurno(turno)
    if (latest) lastDraw = latest

    if (exists) {
      details[turno] = { exists: true, latest: latest?.date || null, scraped: false }
      continue
    }

    if (alreadyExpired) {
      errors.push(`${turno}: skipped (timeout approaching)`)
      details[turno] = { exists: false, latest: latest?.date || null, scraped: false }
      continue
    }

    try {
      const result = await fetchWithFallback(fechaISO, fUrl, turno, sourceStats)

      if (result.numbers.length >= 20) {
        const saved = await saveDraw(fechaISO, turno, result.numbers, result.source)
        if (saved) {
          newDraws++
          details[turno] = {
            exists: true,
            latest: fechaISO,
            scraped: true,
            source: result.source,
            numbersCount: result.numbers.length,
          }
          // Refresh materialized views (draw_stats, markov_transitions, cooccurrence_matrix)
          // These power the V7 engine — must be fresh for accurate predictions
          try {
            await Promise.allSettled([
              getSupabaseAdmin().rpc('refresh_all_prediction_stats' as never),
              getSupabaseAdmin().rpc('refresh_cached_predictions_3_4' as never, { turno_objetivo: turno } as never),
            ])
          } catch {}
          logScrape({
            action: "scrape",
            source: result.source,
            fecha: fechaISO,
            turno,
            drawsAdded: 1,
            drawsTotal: result.numbers.length,
            duration: result.duration,
            status: "OK",
            message: `Scraped ${turno} for ${fechaISO}: ${result.numbers.length} numbers from ${result.source}`,
          })
        } else {
          errors.push(`${turno}: save failed`)
          details[turno] = { exists: false, latest: latest?.date || null, scraped: false }
        }
      } else {
        errors.push(`${turno}: only ${result.numbers.length} numbers scraped`)
        details[turno] = { exists: false, latest: latest?.date || null, scraped: false }
      }
    } catch (e) {
      errors.push(`${turno}: scrape error - ${String(e)}`)
      details[turno] = { exists: false, latest: latest?.date || null, scraped: false }
    }
  }

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

  logScrape({
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

  await cacheSet(getCacheKey(fechaISO), result, CACHE_TTL_MS)
  return result
}

// ── Public API ───────────────────────────────────────────────────────

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
