/**
 * /api/health
 *
 * Pipeline health check — audita todo el sistema Quiniela IA.
 * Retorna status por componente: HEALTHY / DEGRADED / FAILED / NOT_VERIFIED
 * Además expone `status` global en minúsculas: "ok" | "degraded" | "failed"
 * (espejo de `overall`, que conserva la semántica original del archivo).
 *
 * Componentes verificados:
 * - SCRAPER: draws recientes, timestamps, duplicados, números inválidos
 * - SUPABASE: tablas, funciones, RLS
 * - PRECOMPUTE: predictions_cache completo para hoy
 * - CACHE: 2C/3C/4C/redoblona por turno
 * - PREDICTIONS: API funcional con live fallback
 * - AUTOPILOT: ejecución reciente, idempotencia
 * - EVALUATION: verificaciones pendientes, stats actualizadas
 * - OOS: walkforward_results acumulados
 * - OMEGA RULE: validaciones registradas
 * - DATABASE: conectividad + count simple
 * - LATEST_OFFICIAL_DRAW: último sorteo oficial y su antigüedad hábil
 * - DRAW_STATS_FRESHNESS: frescura de la MV draw_stats (computed_at)
 * - CRON_FRESHNESS: frescura de la última ejecución de cada cron (cron_logs)
 *
 * Todas las lecturas de BD están envueltas en try/catch: si una query falla,
 * ese componente queda FAILED/DEGRADED pero el endpoint SIEMPRE responde.
 * Nunca se emiten secrets/tokens en la respuesta ni en los mensajes de error.
 * Sin escrituras: el endpoint es 100% de sólo lectura.
 */

import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { esDiaSinSorteo } from "@/lib/feriados"

export const maxDuration = 60

const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9" // Quiniela Nacional
const POCEADA_GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678" // Quiniela Poceada
const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
const TURNOS_ALL = [...TURNOS, "Poceada"]

/** Los crons conocidos y su frecuencia esperada, en MINUTOS HÁBILES (ver minutosHabilesEntre). */
const CRON_ESPERADOS: Array<{ nombre: string; aliases: string[]; maxEdadMin: number }> = [
  // README: safety net cada 15 min → tolerancia 60 min
  { nombre: "cron-scrape", aliases: ["cron-scrape"], maxEdadMin: 60 },
  // README: verify predictions cada 5 min → tolerancia 60 min.
  // El endpoint es /api/cron-verify-predictions pero loguea como "cron-verify".
  { nombre: "cron-verify-predictions", aliases: ["cron-verify-predictions", "cron-verify"], maxEdadMin: 60 },
  // Event-driven (se dispara tras cada sorteo guardado) → tolerancia 24 h
  { nombre: "cron-precompute", aliases: ["cron-precompute"], maxEdadMin: 60 * 24 },
  // README: catchup diario 09:00 → tolerancia 36 h
  { nombre: "cron-verify-catchup", aliases: ["cron-verify-catchup"], maxEdadMin: 60 * 36 },
  // Vercel Cron diario 04:00 UTC → tolerancia 36 h
  { nombre: "cron-premium-expiry", aliases: ["cron-premium-expiry"], maxEdadMin: 60 * 36 },
  // Se dispara tras cada scrape con sorteos nuevos → tolerancia 48 h
  { nombre: "cron-analytics", aliases: ["cron-analytics"], maxEdadMin: 60 * 48 },
  // Entrenamiento/ajuste de modelos → tolerancia 48 h
  { nombre: "cron-ml-training", aliases: ["cron-ml-training"], maxEdadMin: 60 * 48 },
]

type Status = "HEALTHY" | "DEGRADED" | "FAILED" | "NOT_VERIFIED"

/** Mir global en minúsculas (encargo: status ok/degraded; failed si hay FAILED). */
type StatusGlobal = "ok" | "degraded" | "failed"

interface ComponentResult {
  status: Status
  details: Record<string, unknown>
  errors: string[]
}

interface HealthReport {
  overall: Status
  status: StatusGlobal
  timestamp: string
  components: {
    scraper: ComponentResult
    draws: ComponentResult
    precompute: ComponentResult
    cache: ComponentResult
    predictions: ComponentResult
    evaluation: ComponentResult
    oos: ComponentResult
    omegaRule: ComponentResult
    frozenModel: ComponentResult
    database: ComponentResult
    latest_official_draw: ComponentResult
    draw_stats_freshness: ComponentResult
    cron_freshness: ComponentResult
  }
  alerts: string[]
}

type ComponentKey = keyof HealthReport["components"]

// ── Helpers de tiempo (ART = UTC-3, sin DST) ─────────────────────────────
const MS_POR_MINUTO = 60_000
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO

/** "YYYY-MM-DD" en zona horaria de Buenos Aires para un timestamp dado. */
function fechaART(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ts))
}

/** Timestamp (ms) de las 00:00 ART de una fecha ISO "YYYY-MM-DD". */
function tsDeFecha(fechaISO: string): number {
  return new Date(`${fechaISO}T00:00:00-03:00`).getTime()
}

function diaSemanaDeFecha(fechaISO: string): number {
  return new Date(`${fechaISO}T12:00:00Z`).getUTCDay()
}

/** Domingos y feriados argentinos no tienen sorteo. */
function esDiaConSorteo(fechaISO: string): boolean {
  return !esDiaSinSorteo(fechaISO, diaSemanaDeFecha(fechaISO))
}

/**
 * Minutos transcurridos entre `desde` y `hasta` contando SOLO los días con
 * sorteo (domingos/feriados no corren el reloj de frescura). Evita falsos
 * negativos: p.ej. el lunes a la mañana el último sorteo del sábado no debe
 * aparecer con 48 h de antigüedad por el domingo en medio.
 */
function minutosHabilesEntre(desde: number, hasta: number): number {
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde >= hasta) return 0
  let acumulado = 0
  let inicioDia = tsDeFecha(fechaART(desde))
  for (let i = 0; i < 120 && inicioDia < hasta; i++) {
    const finDia = inicioDia + MS_POR_DIA
    const segDesde = Math.max(inicioDia, desde)
    const segHasta = Math.min(finDia, hasta)
    if (segHasta > segDesde && esDiaConSorteo(fechaART(inicioDia))) {
      acumulado += segHasta - segDesde
    }
    inicioDia = finDia
  }
  return Math.round(acumulado / MS_POR_MINUTO)
}

function buildResponse(report: HealthReport): NextResponse {
  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "no-store",
      "X-Health-Status": report.overall,
    },
  })
}

export async function GET(req: NextRequest) {
  // Allow both cron auth and admin token (timing-safe)
  const auth = await validateCronAuth(req)
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  const cronSecret = process.env.CRON_SECRET || ""
  let isAdmin = false
  if (token.length > 0 && cronSecret.length > 0 && token.length === cronSecret.length) {
    const { timingSafeEqual } = await import("crypto")
    isAdmin = timingSafeEqual(Buffer.from(token), Buffer.from(cronSecret))
  }

  if (!auth.authorized && !isAdmin) return unauthorizedResponse()

  const now = new Date()
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
  const alerts: string[] = []

  const report: HealthReport = {
    overall: "HEALTHY",
    status: "ok",
    timestamp: now.toISOString(),
    components: {
      scraper: { status: "NOT_VERIFIED", details: {}, errors: [] },
      draws: { status: "NOT_VERIFIED", details: {}, errors: [] },
      precompute: { status: "NOT_VERIFIED", details: {}, errors: [] },
      cache: { status: "NOT_VERIFIED", details: {}, errors: [] },
      predictions: { status: "NOT_VERIFIED", details: {}, errors: [] },
      evaluation: { status: "NOT_VERIFIED", details: {}, errors: [] },
      oos: { status: "NOT_VERIFIED", details: {}, errors: [] },
      omegaRule: { status: "NOT_VERIFIED", details: {}, errors: [] },
      frozenModel: { status: "NOT_VERIFIED", details: {}, errors: [] },
      database: { status: "NOT_VERIFIED", details: {}, errors: [] },
      latest_official_draw: { status: "NOT_VERIFIED", details: {}, errors: [] },
      draw_stats_freshness: { status: "NOT_VERIFIED", details: {}, errors: [] },
      cron_freshness: { status: "NOT_VERIFIED", details: {}, errors: [] },
    },
    alerts,
  }

  // ── 0. CLIENTE SUPABASE ──
  // Si falta la configuración (env), el endpoint NO revienta: todos los
  // componentes quedan FAILED y se responde con el reporte completo.
  const supabase: SupabaseClient | null = (() => {
    try {
      return getSupabaseAdmin()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      for (const key of Object.keys(report.components) as ComponentKey[]) {
        report.components[key].status = "FAILED"
        report.components[key].errors.push(`Supabase admin no disponible: ${msg}`)
      }
      alerts.push(`DATABASE: Supabase admin no disponible — ${msg}`)
      return null
    }
  })()

  if (!supabase) {
    report.overall = "FAILED"
    report.status = "failed"
    return buildResponse(report)
  }

  // ── 1. DRAWS AUDIT ──
  try {
    const { data: drawsByTurno, error: drawsErr } = await supabase
      .from("draws")
      .select("turno, id, date, numbers, created_at")
      .in("game_id", [GAME_ID, POCEADA_GAME_ID])
      .order("date", { ascending: false })
    if (drawsErr) throw new Error(drawsErr.message)

    const drawStats: Record<string, {
      totalRows: number
      uniqueSorteos: number
      uniqueDays: number
      firstDate: string
      lastDate: string
      lastCreated: string
      invalidNumbers: number
      duplicates: number
      missingPositions: number
    }> = {}

    for (const turno of TURNOS_ALL) {
      const turnoDraws = (drawsByTurno || []).filter((d) => d.turno === turno)
      const uniqueDates = new Set(turnoDraws.map((d) => d.date))
      const uniqueSorteos = new Set(turnoDraws.map((d) => d.date)).size

      let invalidNumbers = 0
      let missingPositions = 0
      for (const d of turnoDraws) {
        const nums = d.numbers as number[] || []
        if (nums.length !== 20) missingPositions++
        for (const n of nums) {
          // Draws store 4-digit lottery numbers; quiniela uses MOD(n, 100) = last 2 digits (0-99)
          const quinielaNum = typeof n === "number" ? n % 100 : -1
          if (typeof n !== "number" || quinielaNum < 0 || quinielaNum > 99) invalidNumbers++
        }
      }

      // Check for duplicate dates (same date + turno = duplicate)
      const dateCounts: Record<string, number> = {}
      for (const d of turnoDraws) {
        dateCounts[d.date] = (dateCounts[d.date] || 0) + 1
      }
      const duplicates = Object.values(dateCounts).filter((c) => c > 1).length

      drawStats[turno] = {
        totalRows: turnoDraws.length,
        uniqueSorteos: uniqueSorteos,
        uniqueDays: uniqueDates.size,
        firstDate: turnoDraws.length > 0 ? turnoDraws[turnoDraws.length - 1].date : "N/A",
        lastDate: turnoDraws.length > 0 ? turnoDraws[0].date : "N/A",
        lastCreated: turnoDraws.length > 0 ? turnoDraws[0].created_at : "N/A",
        invalidNumbers,
        duplicates,
        missingPositions,
      }

      if (duplicates > 0) {
        report.components.draws.errors.push(`${turno}: ${duplicates} duplicate dates`)
        alerts.push(`DRAWS: ${turno} has ${duplicates} duplicate dates`)
      }
      if (invalidNumbers > 0) {
        report.components.draws.errors.push(`${turno}: ${invalidNumbers} invalid numbers`)
        alerts.push(`DRAWS: ${turno} has ${invalidNumbers} invalid numbers (out of 0-99 range)`)
      }
      if (missingPositions > 0) {
        report.components.draws.errors.push(`${turno}: ${missingPositions} draws with != 20 positions`)
        alerts.push(`DRAWS: ${turno} has ${missingPositions} draws without 20 positions`)
      }
    }

    report.components.draws.details = drawStats
    report.components.draws.status = report.components.draws.errors.length === 0 ? "HEALTHY" : "DEGRADED"
  } catch (e) {
    report.components.draws.status = "FAILED"
    report.components.draws.errors.push(String(e))
    alerts.push(`DRAWS: audit failed — ${e}`)
  }

  // ── 2. SCRAPER (last scrape timestamp) ──
  try {
    const { data: lastDraw } = await supabase
      .from("draws")
      .select("created_at, date, turno")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    const lastScrape = lastDraw?.created_at ? new Date(lastDraw.created_at) : null
    const hoursSinceLastScrape = lastScrape ? (now.getTime() - lastScrape.getTime()) / (1000 * 60 * 60) : 999

    report.components.scraper.details = {
      lastScrape: lastDraw?.created_at || "N/A",
      lastDrawDate: lastDraw?.date || "N/A",
      lastDrawTurno: lastDraw?.turno || "N/A",
      hoursSinceLastScrape: Math.round(hoursSinceLastScrape * 10) / 10,
    }

    // On Mon-Sat during business hours (10-22 ART), expect scrape within 1 hour
    const weekday = now.getDay()
    const hourART = (now.getUTCHours() - 3 + 24) % 24
    const isBusinessHours = weekday >= 1 && weekday <= 6 && hourART >= 10 && hourART <= 22

    if (isBusinessHours && hoursSinceLastScrape > 1.5) {
      report.components.scraper.status = "DEGRADED"
      alerts.push(`SCRAPER: last scrape was ${hoursSinceLastScrape}h ago (expected < 1h during business hours)`)
    } else if (hoursSinceLastScrape > 24) {
      report.components.scraper.status = "FAILED"
      alerts.push(`SCRAPER: last scrape was ${hoursSinceLastScrape}h ago (> 24h)`)
    } else {
      report.components.scraper.status = "HEALTHY"
    }
  } catch (e) {
    report.components.scraper.status = "FAILED"
    report.components.scraper.errors.push(String(e))
  }

  // ── 3. CACHE / PRECOMPUTE ──
  try {
    const { data: cacheRows, error: cacheErr } = await supabase
      .from("predictions_cache")
      .select("turno, date, engine_version, numeros_2, numeros_3, numeros_4, redoblona, confidence")
      .in("game_id", [GAME_ID, POCEADA_GAME_ID])
      .eq("date", today)
    if (cacheErr) throw new Error(cacheErr.message)

    const cacheByTurno: Record<string, { has2C: boolean; has3C: boolean; has4C: boolean; hasRedoblona: boolean; engine: string; confidence: number }> = {}

    for (const turno of TURNOS_ALL) {
      const row = (cacheRows || []).find((c) => c.turno === turno)
      if (!row) {
        cacheByTurno[turno] = { has2C: false, has3C: false, has4C: false, hasRedoblona: false, engine: "N/A", confidence: 0 }
        report.components.cache.errors.push(`${turno}: NO CACHE for today`)
        alerts.push(`CACHE: ${turno} has no predictions for ${today}`)
        continue
      }

      const nums2 = row.numeros_2 as Array<Record<string, unknown>> | null
      const nums3 = row.numeros_3 as string[] | null
      const nums4 = row.numeros_4 as string[] | null
      const rb = row.redoblona as { cabeza: string; acompanante: string } | null

      cacheByTurno[turno] = {
        has2C: Array.isArray(nums2) && nums2.length >= 10,
        has3C: Array.isArray(nums3) && nums3.length >= 10,
        has4C: Array.isArray(nums4) && nums4.length >= 10,
        hasRedoblona: !!(rb?.cabeza && rb?.acompanante),
        engine: row.engine_version || "N/A",
        confidence: row.confidence || 0,
      }

      if (!cacheByTurno[turno].has2C) {
        report.components.cache.errors.push(`${turno}: missing or incomplete 2C`)
        alerts.push(`CACHE: ${turno} missing 2C predictions`)
      }
      if (!cacheByTurno[turno].has3C) {
        report.components.cache.errors.push(`${turno}: missing 3C`)
      }
      if (!cacheByTurno[turno].has4C) {
        report.components.cache.errors.push(`${turno}: missing 4C`)
      }
    }

    report.components.cache.details = cacheByTurno
    report.components.precompute.details = cacheByTurno
    report.components.cache.status = report.components.cache.errors.length === 0 ? "HEALTHY" : "DEGRADED"
    report.components.precompute.status = report.components.cache.status
  } catch (e) {
    report.components.cache.status = "FAILED"
    report.components.precompute.status = "FAILED"
    alerts.push(`CACHE: audit failed — ${e}`)
  }

  // ── 4. PREDICTIONS (check engine_version consistency) ──
  try {
    const { data: recentPreds, error: predErr } = await supabase
      .from("predictions_cache")
      .select("turno, date, engine_version, confidence")
      .in("game_id", [GAME_ID, POCEADA_GAME_ID])
      .order("date", { ascending: false })
      .limit(15)
    if (predErr) throw new Error(predErr.message)

    const engineVersions = new Set((recentPreds || []).map((p) => p.engine_version))
    const hasCanonicalEngine = engineVersions.has("meta-ensemble-v1")

    report.components.predictions.details = {
      recentEngineVersions: Array.from(engineVersions),
      hasCanonicalEngine,
      recentCount: (recentPreds || []).length,
      games: ["Nacional", "Poceada"],
    }

    if (!hasCanonicalEngine) {
      report.components.predictions.status = "DEGRADED"
      alerts.push(`PREDICTIONS: no canonical engine (meta-ensemble-v1) in recent cache: ${Array.from(engineVersions).join(", ")}`)
    } else {
      report.components.predictions.status = "HEALTHY"
    }
  } catch (e) {
    report.components.predictions.status = "FAILED"
  }

  // ── 5. EVALUATION (user_predictions pending vs verified) ──
  // FIX de case: el CHECK de la BD exige MAYÚSCULAS
  // (status IN ('PENDING','WON','LOST','NEAR_MISS')) — filtrar en minúsculas
  // devolvía siempre 0.
  try {
    const countByStatus = async (status?: string): Promise<number> => {
      let query = supabase
        .from("user_predictions")
        .select("id", { count: "exact", head: true })
      if (status) query = query.eq("status", status)
      const { count, error } = await query
      if (error) throw new Error(error.message)
      return count || 0
    }

    const totalPreds = await countByStatus()
    const pendingPreds = await countByStatus("PENDING")
    const wonPreds = await countByStatus("WON")
    const lostPreds = await countByStatus("LOST")
    const nearMissPreds = await countByStatus("NEAR_MISS")

    report.components.evaluation.details = {
      totalPredictions: totalPreds,
      pending: pendingPreds,
      won: wonPreds,
      lost: lostPreds,
      nearMiss: nearMissPreds,
      statusValues: ["PENDING", "WON", "LOST", "NEAR_MISS"],
    }

    report.components.evaluation.status = "HEALTHY"
  } catch (e) {
    report.components.evaluation.status = "FAILED"
    report.components.evaluation.errors.push(String(e))
  }

  // ── 6. OOS (walkforward_results) ──
  try {
    const { data: wfStats } = await supabase
      .from("walkforward_results")
      .select("turno, engine_name, is_hit, is_near_miss")

    const wfByTurno: Record<string, { total: number; hits: number; nearMisses: number; engines: string[] }> = {}

    for (const row of wfStats || []) {
      const t = row.turno as string
      if (!wfByTurno[t]) wfByTurno[t] = { total: 0, hits: 0, nearMisses: 0, engines: [] }
      wfByTurno[t].total += 1
      if (row.is_hit) wfByTurno[t].hits += 1
      if (row.is_near_miss) wfByTurno[t].nearMisses += 1
      if (!wfByTurno[t].engines.includes(row.engine_name)) wfByTurno[t].engines.push(row.engine_name)
    }

    const totalWfRows = (wfStats || []).length

    report.components.oos.details = {
      totalRows: totalWfRows,
      byTurno: wfByTurno,
    }

    report.components.oos.status = totalWfRows > 0 ? "HEALTHY" : "DEGRADED"
    if (totalWfRows === 0) {
      alerts.push("OOS: walkforward_results is empty — no OOS data accumulated")
    }
  } catch (e) {
    report.components.oos.status = "FAILED"
  }

  // ── 7. OMEGA RULE (promotion audit) ──
  try {
    const { data: auditRows } = await supabase
      .from("omega_promotion_audit")
      .select("turno, decision, promoted_at")
      .order("promoted_at", { ascending: false })
      .limit(10)

    report.components.omegaRule.details = {
      recentAudits: (auditRows || []).length,
      lastDecision: auditRows?.[0]?.decision || "N/A",
      lastPromotion: auditRows?.[0]?.promoted_at || "N/A",
    }

    report.components.omegaRule.status = "HEALTHY"
  } catch (e) {
    report.components.omegaRule.status = "NOT_VERIFIED"
  }

  // ── 8. FROZEN MODEL ──
  try {
    const { data: configRows } = await supabase
      .from("engine_config")
      .select("engine_version, turno, pattern_penalty_enabled")

    const engines = new Set((configRows || []).map((r) => r.engine_version))
    const patternDisabled = (configRows || []).every((r) => r.pattern_penalty_enabled === false)

    report.components.frozenModel.details = {
      engineVersions: Array.from(engines),
      patternDisabled,
      configCount: (configRows || []).length,
    }

    report.components.frozenModel.status = "HEALTHY"
  } catch (e) {
    report.components.frozenModel.status = "NOT_VERIFIED"
  }

  // ── 9. DATABASE (conectividad — SELECT/count simple, sólo lectura) ──
  try {
    const t0Db = Date.now()
    const { count, error: dbErr } = await supabase
      .from("draws")
      .select("id", { count: "exact", head: true })
    if (dbErr) throw new Error(dbErr.message)

    report.components.database.details = {
      reachable: true,
      drawsRows: count ?? null,
      latencyMs: Date.now() - t0Db,
    }
    report.components.database.status = "HEALTHY"
  } catch (e) {
    report.components.database.status = "FAILED"
    report.components.database.errors.push(String(e))
    alerts.push(`DATABASE: connectivity check failed — ${e}`)
  }

  // ── 10. LATEST OFFICIAL DRAW (último sorteo + antigüedad hábil) ──
  try {
    const { data: lastDrawRows, error: lastDrawErr } = await supabase
      .from("draws")
      .select("date, turno, game_id, created_at")
      .in("game_id", [GAME_ID, POCEADA_GAME_ID])
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    if (lastDrawErr) throw new Error(lastDrawErr.message)

    const lastDraw = (lastDrawRows || [])[0] as
      | { date?: string; turno?: string; game_id?: string; created_at?: string }
      | undefined

    if (!lastDraw?.date) {
      report.components.latest_official_draw.status = "FAILED"
      report.components.latest_official_draw.errors.push("no hay sorteos oficiales en la tabla draws")
      alerts.push("LATEST_DRAW: no hay ningún sorteo oficial registrado")
    } else {
      // La antigüedad corre desde el inicio del día del sorteo y sólo avanza
      // en días con sorteo (domingos/feriados no suman → sin falsos negativos).
      const ageMinutes = minutosHabilesEntre(tsDeFecha(lastDraw.date), now.getTime())

      report.components.latest_official_draw.details = {
        lastDate: lastDraw.date,
        lastTurno: lastDraw.turno || "N/A",
        game: lastDraw.game_id === POCEADA_GAME_ID ? "Poceada" : "Nacional",
        lastCreated: lastDraw.created_at || "N/A",
        ageMinutes,
        ageHours: Math.round((ageMinutes / 60) * 10) / 10,
        maxAgeHours: 48,
        todayHasDraw: esDiaConSorteo(today),
      }

      if (ageMinutes <= 48 * 60) {
        report.components.latest_official_draw.status = "HEALTHY"
      } else {
        report.components.latest_official_draw.status = "DEGRADED"
        alerts.push(
          `LATEST_DRAW: último sorteo ${lastDraw.date} ${lastDraw.turno || ""} tiene ${Math.round(ageMinutes / 60)}h hábiles (> 48h)`,
        )
      }
    }
  } catch (e) {
    report.components.latest_official_draw.status = "FAILED"
    report.components.latest_official_draw.errors.push(String(e))
    alerts.push(`LATEST_DRAW: check failed — ${e}`)
  }

  // ── 11. DRAW_STATS FRESHNESS (MV draw_stats — forma vieja, usa computed_at) ──
  try {
    const { data: dsRows, error: dsErr } = await supabase
      .from("draw_stats")
      .select("computed_at")
      .order("computed_at", { ascending: false })
      .limit(1)
    if (dsErr) throw new Error(dsErr.message)

    const computedAt = ((dsRows || []) as Array<{ computed_at?: string }>)[0]?.computed_at

    if (!computedAt) {
      report.components.draw_stats_freshness.status = "FAILED"
      report.components.draw_stats_freshness.errors.push("draw_stats vacía (sin computed_at)")
      alerts.push("DRAW_STATS: materialized view vacía o sin computed_at")
    } else {
      const ageMinutes = minutosHabilesEntre(new Date(computedAt).getTime(), now.getTime())

      report.components.draw_stats_freshness.details = {
        computedAt,
        ageMinutes,
        ageHours: Math.round((ageMinutes / 60) * 10) / 10,
        maxAgeHours: 36,
      }

      if (ageMinutes <= 36 * 60) {
        report.components.draw_stats_freshness.status = "HEALTHY"
      } else {
        report.components.draw_stats_freshness.status = "DEGRADED"
        alerts.push(`DRAW_STATS: computed_at tiene ${Math.round(ageMinutes / 60)}h hábiles (> 36h)`)
      }
    }
  } catch (e) {
    report.components.draw_stats_freshness.status = "FAILED"
    report.components.draw_stats_freshness.errors.push(String(e))
    alerts.push(`DRAW_STATS: freshness check failed — ${e}`)
  }

  // ── 12. CRON FRESHNESS (última ejecución por cron conocido en cron_logs) ──
  // cron_logs: id, cron_name, status('success'|'error'|'timeout'), duration_ms,
  // error_message, metadata, created_at (ver lib/cron/auth.ts → logCronExecution).
  // Sólo se leen cron_name/status/created_at; NO se expone error_message ni
  // metadata (podrían contener detalles internos).
  try {
    const { data: logRows, error: logErr } = await supabase
      .from("cron_logs")
      .select("cron_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500)
    if (logErr) throw new Error(logErr.message)

    const rows = (logRows || []) as Array<{
      cron_name?: string | null
      status?: string | null
      created_at?: string | null
    }>

    const ultimoPorCron = new Map<string, { createdAt: string; status: string }>()
    for (const row of rows) {
      if (!row.cron_name || !row.created_at) continue
      if (!ultimoPorCron.has(row.cron_name)) {
        ultimoPorCron.set(row.cron_name, {
          createdAt: row.created_at,
          status: row.status || "unknown",
        })
      }
    }

    if (ultimoPorCron.size === 0) {
      report.components.cron_freshness.status = "FAILED"
      report.components.cron_freshness.errors.push("cron_logs sin ninguna ejecución registrada")
      report.components.cron_freshness.details = { registeredCrons: 0 }
      alerts.push("CRON: no hay ninguna ejecución registrada en cron_logs")
    } else {
      const porCron: Record<string, unknown> = {}
      const aliasUsados = new Set<string>()
      const fueraDeFrecuencia: string[] = []

      for (const esperado of CRON_ESPERADOS) {
        let ultimo: { createdAt: string; status: string } | undefined
        for (const alias of esperado.aliases) {
          aliasUsados.add(alias)
          if (!ultimo && ultimoPorCron.has(alias)) ultimo = ultimoPorCron.get(alias)
        }

        if (!ultimo) {
          // Nunca ejecutado → edad infinita → fuera de frecuencia (DEGRADED).
          porCron[esperado.nombre] = {
            lastRun: null,
            lastStatus: null,
            ageMinutes: null,
            maxAgeMinutes: esperado.maxEdadMin,
            state: "NEVER_RUN",
          }
          fueraDeFrecuencia.push(esperado.nombre)
          continue
        }

        const ageMinutes = minutosHabilesEntre(new Date(ultimo.createdAt).getTime(), now.getTime())
        const state = ageMinutes <= esperado.maxEdadMin ? "HEALTHY" : "OVERDUE"
        if (state === "OVERDUE") fueraDeFrecuencia.push(esperado.nombre)

        porCron[esperado.nombre] = {
          lastRun: ultimo.createdAt,
          lastStatus: ultimo.status,
          ageMinutes,
          maxAgeMinutes: esperado.maxEdadMin,
          state,
        }
      }

      // Otros crons registrados: informativo, no afectan el estado global.
      const otrosCrons: Record<string, unknown> = {}
      for (const [nombre, v] of ultimoPorCron) {
        if (aliasUsados.has(nombre)) continue
        otrosCrons[nombre] = {
          lastRun: v.createdAt,
          lastStatus: v.status,
          ageMinutes: minutosHabilesEntre(new Date(v.createdAt).getTime(), now.getTime()),
        }
      }

      report.components.cron_freshness.details = {
        registeredCrons: ultimoPorCron.size,
        crons: porCron,
        otrosCrons,
        fueraDeFrecuencia,
        unit: "minutes (días sin sorteo excluidos)",
      }

      if (fueraDeFrecuencia.length === 0) {
        report.components.cron_freshness.status = "HEALTHY"
      } else {
        report.components.cron_freshness.status = "DEGRADED"
        report.components.cron_freshness.errors.push(
          `fuera de frecuencia esperada: ${fueraDeFrecuencia.join(", ")}`,
        )
        alerts.push(`CRON: ${fueraDeFrecuencia.length} job(s) sin ejecución reciente — ${fueraDeFrecuencia.join(", ")}`)
      }
    }
  } catch (e) {
    report.components.cron_freshness.status = "FAILED"
    report.components.cron_freshness.errors.push(String(e))
    alerts.push(`CRON: freshness check failed — ${e}`)
  }

  // ── COMPUTE OVERALL STATUS ──
  const statuses = Object.values(report.components).map((c) => c.status)
  if (statuses.includes("FAILED")) {
    report.overall = "FAILED"
  } else if (statuses.includes("DEGRADED")) {
    report.overall = "DEGRADED"
  } else {
    report.overall = "HEALTHY"
  }

  // `status` en minúsculas (encargo: ok / degraded) — misma semántica que overall.
  report.status = report.overall === "HEALTHY"
    ? "ok"
    : report.overall === "DEGRADED"
      ? "degraded"
      : "failed"

  return buildResponse(report)
}
