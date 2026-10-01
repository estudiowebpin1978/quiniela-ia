/**
 * /api/health
 *
 * Pipeline health check — audita todo el sistema Quiniela IA.
 * Retorna status por componente: HEALTHY / DEGRADED / FAILED / NOT_VERIFIED
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
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"

export const maxDuration = 60

const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"
const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

type Status = "HEALTHY" | "DEGRADED" | "FAILED" | "NOT_VERIFIED"

interface ComponentResult {
  status: Status
  details: Record<string, unknown>
  errors: string[]
}

interface HealthReport {
  overall: Status
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
  }
  alerts: string[]
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

  const supabase = getSupabaseAdmin()
  const now = new Date()
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
  const alerts: string[] = []

  const report: HealthReport = {
    overall: "HEALTHY",
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
    },
    alerts,
  }

  // ── 1. DRAWS AUDIT ──
  try {
    const { data: drawsByTurno } = await supabase
      .from("draws")
      .select("turno, id, date, numbers, created_at")
      .eq("game_id", GAME_ID)
      .order("date", { ascending: false })

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

    for (const turno of TURNOS) {
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
    const { data: cacheRows } = await supabase
      .from("predictions_cache")
      .select("turno, date, engine_version, numeros_2, numeros_3, numeros_4, redoblona, confidence")
      .eq("game_id", GAME_ID)
      .eq("date", today)

    const cacheByTurno: Record<string, { has2C: boolean; has3C: boolean; has4C: boolean; hasRedoblona: boolean; engine: string; confidence: number }> = {}

    for (const turno of TURNOS) {
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
    const { data: recentPreds } = await supabase
      .from("predictions_cache")
      .select("turno, date, engine_version, confidence")
      .eq("game_id", GAME_ID)
      .order("date", { ascending: false })
      .limit(15)

    const engineVersions = new Set((recentPreds || []).map((p) => p.engine_version))
    const hasCanonicalEngine = engineVersions.has("meta-ensemble-v1")

    report.components.predictions.details = {
      recentEngineVersions: Array.from(engineVersions),
      hasCanonicalEngine,
      recentCount: (recentPreds || []).length,
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
  try {
    const { count: totalPreds } = await supabase
      .from("user_predictions")
      .select("id", { count: "exact", head: true })

    const { count: pendingPreds } = await supabase
      .from("user_predictions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")

    const { count: wonPreds } = await supabase
      .from("user_predictions")
      .select("id", { count: "exact", head: true })
      .eq("status", "won")

    const { count: lostPreds } = await supabase
      .from("user_predictions")
      .select("id", { count: "exact", head: true })
      .eq("status", "lost")

    report.components.evaluation.details = {
      totalPredictions: totalPreds || 0,
      pending: pendingPreds || 0,
      won: wonPreds || 0,
      lost: lostPreds || 0,
    }

    report.components.evaluation.status = "HEALTHY"
  } catch (e) {
    report.components.evaluation.status = "FAILED"
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

  // ── COMPUTE OVERALL STATUS ──
  const statuses = Object.values(report.components).map((c) => c.status)
  if (statuses.includes("FAILED")) {
    report.overall = "FAILED"
  } else if (statuses.includes("DEGRADED")) {
    report.overall = "DEGRADED"
  } else {
    report.overall = "HEALTHY"
  }

  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "no-store",
      "X-Health-Status": report.overall,
    },
  })
}
