/**
 * /api/cron-run — Orchestrator unificado: scrape + precompute
 *
 * Pipeline con CADENA DE DEPENDENCIAS:
 *   Cada turno DEPENDE del anterior:
 *     Previa     → necesita Nocturna de AYER
 *     Primera    → necesita Previa de HOY
 *     Matutina   → necesita Primera de HOY
 *     Vespertina → necesita Matutina de HOY
 *     Nocturna   → necesita Vespertina de HOY
 *
 * El orchestrator procesa turnos en ORDEN y solo ejecuta precompute
 * si el dependency check pasa (el sorteo anterior existe en la DB).
 *
 * Las predicciones se generan ON-DEMAND cuando el usuario las solicita.
 * La verificación se ejecuta automáticamente al cargar el sorteo oficial.
 *
 * Timing (Buenos Aires):
 *   Previa:     10:15 → scrape 10:20, precompute 10:25
 *   Primera:    12:00 → scrape 12:05, precompute 12:10
 *   Matutina:   15:00 → scrape 15:05, precompute 15:10
 *   Vespertina: 18:00 → scrape 18:05, precompute 18:10
 *   Nocturna:   21:00 → scrape 21:05, precompute 21:10
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { esDiaSinSorteo } from "@/lib/feriados"
import { TURNOS_ORDER, getDependency, dateART } from "@/lib/quiniela-timeline"
import logger from "@/lib/logger"
import { LOTBA } from "@/lib/config/lotba"
import { SUENOS } from "@/lib/suenos"

export const maxDuration = 300

const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const

/** Draw times in Buenos Aires (hour.decimal) */
const TURNO_TIMES: Record<string, number> = {
  Previa: 10.25,
  Primera: 12.0,
  Matutina: 15.0,
  Vespertina: 18.0,
  Nocturna: 21.0,
  Poceada: 21.0,
}

/** How many minutes after draw time to run scrape */
const SCRAPE_DELAY_MIN = 5

/** How many minutes after draw time to run precompute */
const PRECOMPUTE_DELAY_MIN = 10

function getArtNow(): { date: string; hour: number; minute: number; decimal: number; dayOfWeek: number } {
  const now = new Date()
  const artStr = now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  const artDate = new Date(artStr)
  const hour = artDate.getHours()
  const minute = artDate.getMinutes()
  const decimal = hour + minute / 60
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
  const dayOfWeek = artDate.getDay()
  return { date, hour, minute, decimal, dayOfWeek }
}

/** Check if we should scrape for a specific turno (after draw time + delay) */
function shouldScrape(turno: string, artNow: ReturnType<typeof getArtNow>): boolean {
  const drawTime = TURNO_TIMES[turno]
  if (!drawTime) return false
  return artNow.decimal >= drawTime + SCRAPE_DELAY_MIN / 60
}

/** Check if we should precompute (after scrape window) */
function shouldPrecompute(turno: string, artNow: ReturnType<typeof getArtNow>): boolean {
  const drawTime = TURNO_TIMES[turno]
  if (!drawTime) return false
  return artNow.decimal >= drawTime + PRECOMPUTE_DELAY_MIN / 60
}

/** Check if the prerequisite draw exists in the database */
async function checkDependency(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  targetTurno: string,
  artDate: string,
): Promise<{ ok: boolean; reason: string }> {
  const dep = getDependency(targetTurno as typeof TURNOS_ORDER[number])
  // No dependency (Poceada is independent)
  if (!dep) {
    return { ok: true, reason: `${targetTurno} has no dependency (independent)` }
  }
  const expectedDate = dateART(dep.dateOffset)

  const { data: draw } = await supabase
    .from("draws")
    .select("id")
    .eq("turno", dep.turno)
    .eq("date", expectedDate)
    .limit(1)

  if (!draw || draw.length === 0) {
    return { ok: false, reason: `Falta ${dep.turno} del ${expectedDate}` }
  }

  return { ok: true, reason: `${dep.turno} del ${expectedDate} OK` }
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const artNow = getArtNow()
  const turnoFilter = req.nextUrl.searchParams.get("turno")
  const forceAll = req.nextUrl.searchParams.get("force") === "1"

  logger.info("[cron-run] Starting orchestrator", {
    artDate: artNow.date,
    artTime: `${artNow.hour}:${String(artNow.minute).padStart(2, "0")}`,
    turnoFilter: turnoFilter || "all",
    force: forceAll,
  })

  // Check if today is a valid draw day
  if (esDiaSinSorteo(artNow.date, artNow.dayOfWeek) && !forceAll) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Día sin sorteo (feriado/domingo)",
      date: artNow.date,
      elapsed: Date.now() - t0,
    })
  }

  const supabase = getSupabaseAdmin()
  const results: Record<string, unknown> = {}

  // ── PHASE 1: SCRAPE ──
  const scrapeResults: Record<string, string> = {}
  const turnosToScrape = turnoFilter ? [turnoFilter] : [...TURNOS]

  for (const turno of turnosToScrape) {
    if (!forceAll && !shouldScrape(turno, artNow)) {
      scrapeResults[turno] = "skipped (too early)"
      continue
    }

    try {
      // Check if we already have today's draw for this turno
      const { data: existing } = await supabase
        .from("draws")
        .select("id")
        .eq("turno", turno)
        .eq("date", artNow.date)
        .limit(1)

      if (existing && existing.length > 0 && !forceAll) {
        scrapeResults[turno] = "already exists"
        continue
      }

      // Import and run scrape for this turno
      const { fetchWithConsensus } = await import("@/lib/scrapers/consensus")

      const p = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format()
      const [yyyy, mm, dd] = p.split("-")
      const fUrl = `${dd}-${mm}-${yyyy.slice(-2)}`

      const stats: Record<string, { ok: number; fail: number; totalDuration: number }> = {}
      const scrapeResult = await fetchWithConsensus(artNow.date, fUrl, turno as never, stats)

      if (!scrapeResult.ok || !scrapeResult.numbers || scrapeResult.numbers.length === 0) {
        scrapeResults[turno] = scrapeResult.consensusMethod === "abort_no_quorum" ? "CONFLICT (no quorum)" : "no numbers available yet"
        continue
      }

      // Upsert draw via RPC (upsert_draw incluye guard anti-duplicados:
      // rechaza números idénticos al sorteo anterior del mismo turno)
      const { error: upsertErr } = await supabase.rpc("upsert_draw" as never, {
        p_date: artNow.date,
        p_turno: turno,
        p_numbers: scrapeResult.numbers,
        p_source: scrapeResult.source || "consensus",
        p_game_id: GAME_ID,
        p_jurisdiccion: LOTBA.jurisdiction,
      } as never)

      if (upsertErr) {
        scrapeResults[turno] = `upsert error: ${upsertErr.message}`
      } else {
        scrapeResults[turno] = `OK (${scrapeResult.numbers.join(", ")})`
        // Verify predictions immediately after saving the draw
        try {
          const { data: vData, error: vErr } = await supabase.schema("api").rpc("verify_predictions_for_draw" as never, {
            p_date: artNow.date, p_turno: turno,
          } as never)
          if (vErr) logger.warn("[cron-run] verify failed", { turno, error: vErr.message })
          else if (vData) logger.info("[cron-run] verified", { turno, resultado: vData })
        } catch (e) {
          logger.warn("[cron-run] verify exception", { turno, error: String(e) })
        }
      }
    } catch (e: unknown) {
      scrapeResults[turno] = `error: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  results.scrape = scrapeResults

  // ── PHASE 2: PRECOMPUTE (with dependency chain) ──
  const precomputeResults: Record<string, string> = {}

  for (const turno of turnosToScrape) {
    if (!forceAll && !shouldPrecompute(turno, artNow)) {
      precomputeResults[turno] = "skipped (too early)"
      continue
    }

    // Check dependency: need the previous turno's draw
    const depCheck = await checkDependency(supabase, turno, artNow.date)
    if (!depCheck.ok) {
      precomputeResults[turno] = `skipped (${depCheck.reason})`
      continue
    }

    try {
      const precomputeResult = await runPrecompute(supabase, turno, artNow.date)
      precomputeResults[turno] = precomputeResult.ok ? "OK" : `FAIL: ${precomputeResult.error}`
    } catch (e: unknown) {
      precomputeResults[turno] = `error: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  results.precompute = precomputeResults

  // Refresh draw_stats manually (trigger removed to avoid timeout; best-effort)
  try {
    await supabase.rpc("refresh_draw_stats_rpc" as never)
    logger.info("[cron-run] draw_stats refreshed")
  } catch (e: unknown) {
    logger.warn("[cron-run] draw_stats refresh failed (non-blocking)", { error: String(e) })
  }

  const elapsed = Date.now() - t0
  logger.info("[cron-run] Orchestrator completed", { elapsed, results })

  return NextResponse.json({
    ok: true,
    date: artNow.date,
    artTime: `${artNow.hour}:${String(artNow.minute).padStart(2, "0")}`,
    results,
    elapsed,
  })
}

// ── POST handler (same as GET, for external cron services) ──
export async function POST(req: NextRequest) {
  return GET(req)
}

// ── Internal: Run precompute for a single turno ──
async function runPrecompute(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  turno: string,
  today: string,
): Promise<{ ok: boolean; error?: string }> {
  // 1. Get last draw for context seed
  const turnGameId = turno === "Poceada" ? "d0e1f2a3-b4c5-6789-0abc-def012345678" : GAME_ID
  const { data: lastDraw } = await supabase
    .from("draws")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .single()

  if (!lastDraw) return { ok: false, error: "No draws in database" }

  const lastDrawId = lastDraw.id as string
  const ctxSeed = (lastDrawId.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) +
    turno.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % 100000

  // 2. Fetch historical draws
  const { data: histDraws } = await supabase
    .from("draws")
    .select("id, date, turno, numbers")
    .eq("turno", turno)
    .eq("game_id", turno === "Poceada" ? "d0e1f2a3-b4c5-6789-0abc-def012345678" : "ac593199-c299-4f03-b1b7-8675fe4fa6d9")
    .lte("id", lastDrawId)
    .order("date", { ascending: true })

  const minDraws = turno === "Poceada" ? 3 : 10
  if (!histDraws || histDraws.length < minDraws) return { ok: false, error: `Insufficient draws (${histDraws?.length || 0}/${minDraws})` }

  type Draw = { fecha: string; turno: string; numbers: number[] }
  const draws: Draw[] = histDraws.map((d: Record<string, unknown>) => ({
    fecha: d.date as string,
    turno: d.turno as string,
    numbers: d.numbers as number[],
  }))

  // 3. Run V6
  let v6Rows: unknown[] | null = null
  try {
    const { data } = await supabase.rpc("calculate_omega_v6", {
      p_turno: turno,
      p_tier: "free",
      p_date: today,
    })
    v6Rows = data
  } catch { /* V6 failed, continue with V7/ML */ }

  // 4. Run V7
  let v7Predictions: Array<{ n: number; numero: string; score: number; factor_attribution: Record<string, number> }> = []
  try {
    const { predictEnsembleV7 } = await import("@/lib/analisis/engine-v7")
    const { loadV7Weights, v7WeightsToFactorBreakdown } = await import("@/lib/analisis/v7-weights")
    const v7Weights = await loadV7Weights(turno)
    const weights = v7WeightsToFactorBreakdown(v7Weights)
    const v7Result = await predictEnsembleV7(draws, turno, 10, ctxSeed, weights)
    v7Predictions = v7Result.predictions.map((p) => ({
      n: parseInt(p.numero),
      numero: p.numero,
      score: p.score,
      factor_attribution: {},
    }))
  } catch { /* V7 failed */ }

  // 5. Run ML
  let mlPredictions: Array<{ n: number; numero: string; score: number; factor_attribution: Record<string, number> }> = []
  try {
    const { getMLPredictions } = await import("@/lib/ml/integration")
    const mlResult = await getMLPredictions(turno, draws)
    if (mlResult?.available && mlResult.scores.size > 0) {
      mlPredictions = Array.from(mlResult.scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([num, score]) => ({
          n: num,
          numero: num < 10 ? `0${num}` : `${num}`,
          score,
          factor_attribution: {},
        }))
    }
  } catch { /* ML failed */ }

  // 6. Blend
  const { loadEngineWeights } = await import("@/lib/ensemble/meta-ensemble")
  let engineWeights = { V6: 0.40, V7: 0.35, ML: 0.25 }
  try { engineWeights = await loadEngineWeights(turno) } catch { /* use defaults */ }

  type BlendedPrediction = { n: number; numero: string; score: number; factor_attribution: Record<string, number> }
  const allNums = new Map<number, BlendedPrediction>()

  if (v6Rows && Array.isArray(v6Rows)) {
    for (const row of v6Rows.slice(0, 20) as Array<Record<string, unknown>>) {
      const num = row.numero as number
      const score = (row.puntaje_total as number) || 0
      const fa = (row.factor_attribution as Record<string, number>) || {}
      allNums.set(num, { n: num, numero: num < 10 ? `0${num}` : `${num}`, score: score * engineWeights.V6, factor_attribution: fa })
    }
  }

  for (const p of v7Predictions) {
    const existing = allNums.get(p.n)
    if (existing) existing.score += p.score * engineWeights.V7
    else allNums.set(p.n, { ...p, score: p.score * engineWeights.V7 })
  }

  for (const p of mlPredictions) {
    const existing = allNums.get(p.n)
    if (existing) existing.score += p.score * engineWeights.ML
    else allNums.set(p.n, { ...p, score: p.score * engineWeights.ML })
  }

  const blended = Array.from(allNums.values()).sort((a, b) => b.score - a.score)
  const top10 = blended.slice(0, 10)

  if (top10.length === 0) return { ok: false, error: "No predictions generated" }

  // 7. Get 3C/4C from cache
  // NOTA: redoblona se guarda SIEMPRE como objeto JSONB {cabeza, acompanante}.
  // Antes se convertía a string "XX-YY" y la próxima corrida lo degradaba a null
  // (typeof string !== "object" → no se re-leía → se re-escribía como null).
  let numeros_3: string[] = []
  let numeros_4: string[] = []
  let redoblona: { cabeza: string; acompanante: string } | null = null

  try {
    const { data: cached } = await supabase
      .from("predictions_cache")
      .select("numeros_3, numeros_4, redoblona")
      .eq("game_id", turnGameId)
      .eq("date", today)
      .eq("turno", turno)
      .single()

    if (cached) {
      if (Array.isArray(cached.numeros_3)) numeros_3 = cached.numeros_3.map(String)
      if (Array.isArray(cached.numeros_4)) numeros_4 = cached.numeros_4.map(String)
      const rb = cached.redoblona as { cabeza?: string | number; acompanante?: string | number } | null
      if (rb && typeof rb === "object" && rb.cabeza !== undefined && rb.acompanante !== undefined) {
        redoblona = {
          cabeza: String(rb.cabeza).padStart(2, "0"),
          acompanante: String(rb.acompanante).padStart(2, "0"),
        }
      }
    }
  } catch { /* use empty */ }

  // If no 3C/4C from cache, try V6 RPC for premium
  if (numeros_3.length === 0 || numeros_4.length === 0) {
    try {
      const { data: premRows } = await supabase.rpc("calculate_omega_v6", {
        p_turno: turno,
        p_tier: "premium",
        p_date: today,
      })
      if (premRows && Array.isArray(premRows) && premRows.length > 0) {
        const { extractPred3, extractPred4, extractRedoblona } = await import("@/lib/predictions")
        numeros_3 = extractPred3(premRows as never[])
        numeros_4 = extractPred4(premRows as never[])
        const rbObj = extractRedoblona(premRows as never[])
        if (rbObj && !redoblona) {
          redoblona = {
            cabeza: String(rbObj.cabeza).padStart(2, "0"),
            acompanante: String(rbObj.acompanante).padStart(2, "0"),
          }
        }
      }
    } catch (e) {
      logger.warn("[cron-run] V6 RPC 3C/4C fallback failed", { turno, error: String(e) })
    }
  }

  // Redoblona coherente con los numeros_2 que se van a guardar:
  // cabeza = puesto 1 y acompañante = puesto 2 del top10 (misma regla que cron-precompute).
  if (top10.length >= 2) {
    redoblona = {
      cabeza: String(top10[0].n).padStart(2, "0"),
      acompanante: String(top10[1].n).padStart(2, "0"),
    }
  }

  // 8. Upsert predictions_cache
  const suenoDe = (n: number | string) => {
    const k = ((Number(n) % 100) + 100) % 100
    return SUENOS[k] || { emoji: "❓", nombre: "" }
  }

  try {
    const { error: upsertErr } = await supabase.schema("api").rpc("predictions_cache_upsert" as never, {
      p_game_id: turnGameId,
      p_date: today,
      p_turno: turno,
      p_numeros_2: top10.map(p => ({
        n: p.n,
        numero: p.numero,
        score: p.score,
        emoji: suenoDe(p.n).emoji,
        significado: suenoDe(p.n).nombre,
        factor_attribution: p.factor_attribution,
      })),
      p_numeros_3: numeros_3.length > 0 ? numeros_3 : null,
      p_numeros_4: numeros_4.length > 0 ? numeros_4 : null,
      p_redoblona: redoblona || null,
      p_engine_version: "meta-ensemble-v1",
      p_confidence: null,
      p_agreement_score: 0.8,
      p_computed_at: new Date().toISOString(),
      p_updated_at: new Date().toISOString(),
    } as never)
    if (upsertErr) {
      logger.warn("[cron-run] cache upsert error", { turno, error: upsertErr.message })
      return { ok: false, error: `Cache upsert: ${upsertErr.message}` }
    }
  } catch (e) {
    logger.warn("[cron-run] cache upsert exception", { turno, error: String(e) })
    return { ok: false, error: `Cache upsert failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  return { ok: true }
}

