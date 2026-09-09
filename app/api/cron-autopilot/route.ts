/**
 * /api/cron-autopilot
 *
 * CLOSED-LOOP AUTOMATION — Piloto Automático
 *
 * Corre ~10 minutos ANTES de cada sorteo.
 * Genera predicciones usando V6 engine directamente (no depende de cache).
 * Las guarda como PENDING para todos los usuarios premium con autopilot activo.
 * Cuando el scraper guarda el resultado oficial, el trigger trg_verify_on_official_draw
 * verifica automáticamente las predicciones PENDING.
 *
 * Timing (cron-job.org → UTC):
 *   Previa:     10:05 ART → 13:05 UTC
 *   Primera:    11:50 ART → 14:50 UTC
 *   Matutina:   14:50 ART → 17:50 UTC
 *   Vespertina: 17:50 ART → 20:50 UTC
 *   Nocturna:   20:50 ART → 23:50 UTC
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { todayART } from "@/lib/quiniela-timeline"
import { esDiaSinSorteo } from "@/lib/feriados"
import logger from "@/lib/logger"

export const maxDuration = 240

const VALID_TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"] as const
const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"

interface EligibleUser {
  user_id: string
  email: string
  role: string
  premium_until: string | null
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const turno = req.nextUrl.searchParams.get("turno")
  if (!turno || !VALID_TURNOS.includes(turno as typeof VALID_TURNOS[number])) {
    return NextResponse.json({ error: "Invalid turno. Valid: Previa, Primera, Matutina, Vespertina, Nocturna" }, { status: 400 })
  }

  const today = todayART()
  const weekday = new Date(`${today}T12:00:00Z`).getDay()
  if (esDiaSinSorteo(today, weekday)) {
    return NextResponse.json({ ok: true, message: "Domingo/feriado — sin sorteos", processed: 0 })
  }

  const supabase = getSupabaseAdmin()
  const turnoCanonical = turno.charAt(0).toUpperCase() + turno.slice(1).toLowerCase()

  try {
    // ── 1. Generate predictions directly from V6 engine ─────────────
    let predictions: Array<{ numero: string; score: number; factor_attribution: Record<string, number> }> = []
    let engineVersion = "omega_v6"

    try {
      const { data: v6Data, error: v6Error } = await supabase.rpc("calculate_omega_v6" as never, {
        p_turno: turnoCanonical,
        p_tier: "premium",
        p_date: today,
      } as never)

      if (!v6Error && Array.isArray(v6Data) && v6Data.length > 0) {
        predictions = v6Data.map((row: Record<string, unknown>) => ({
          numero: String(row.prediccion_2cifras || "").padStart(2, "0"),
          score: Number(row.puntaje_total) || 0,
          factor_attribution: (row.factor_attribution as Record<string, number>) || {},
        }))
        engineVersion = "omega_v6"
      }
    } catch (e) {
      logger.warn("[cron-autopilot] V6 RPC failed, trying fallback", { error: String(e) })
    }

    // Fallback: try reading from predictions_cache if V6 RPC failed
    if (predictions.length === 0) {
      try {
        const { data: cached } = await supabase
          .from("predictions_cache")
          .select("numeros_2, engine_version, confidence")
          .eq("game_id", GAME_ID)
          .eq("date", today)
          .eq("turno", turnoCanonical)
          .single()

        if (cached?.numeros_2 && Array.isArray(cached.numeros_2) && cached.numeros_2.length > 0) {
          predictions = cached.numeros_2.map((item: Record<string, unknown>) => ({
            numero: String(item.numero ?? item.n ?? "").padStart(2, "0"),
            score: Number(item.score) || 0,
            factor_attribution: (item.factor_attribution as Record<string, number>) || {},
          }))
          engineVersion = cached.engine_version || "meta-ensemble-v1"
        }
      } catch { /* cache miss — continue with empty */ }
    }

    if (predictions.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No se pudieron generar predicciones (V6 RPC + cache fallaron)",
      }, { status: 500 })
    }

    // ── 2. Get eligible users (premium + auto_predict_enabled) ──────
    const { data: rawUsers, error: usersError } = await supabase
      .from("user_profiles")
      .select("id, email, role, premium_until, auto_predict_enabled")
      .eq("auto_predict_enabled", true)
      .or(`premium_until.is.null,premium_until.gt.${new Date().toISOString()}`)

    if (usersError) throw usersError
    if (!rawUsers || rawUsers.length === 0) {
      return NextResponse.json({ ok: true, message: "No autopilot users", processed: 0 })
    }

    const eligible: EligibleUser[] = (rawUsers as Array<Record<string, unknown>>)
      .filter(u => u.role === "premium" || u.role === "admin")
      .map(u => ({
        user_id: u.id as string,
        email: u.email as string,
        role: u.role as string,
        premium_until: u.premium_until as string | null,
      }))

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, message: "No premium autopilot users", processed: 0 })
    }

    // ── 3. Check which users already have predictions ───────────────
    const eligibleIds = eligible.map(u => u.user_id)
    const { data: existingPreds } = await supabase
      .from("user_predictions")
      .select("user_id")
      .eq("date", today)
      .eq("turno", turnoCanonical)
      .in("user_id", eligibleIds)

    const existingSet = new Set((existingPreds || []).map((p: { user_id: string }) => p.user_id))
    const toPredict = eligible.filter(u => !existingSet.has(u.user_id))

    if (toPredict.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "All users already have predictions",
        processed: 0,
        skipped: eligible.length,
      })
    }

    // ── 4. Build prediction rows ────────────────────────────────────
    const top10 = predictions.slice(0, 10)
    const numeros_2 = top10.map(p => p.numero)

    // Build 3/4 cifras from V6 data if available
    let numeros_3: string[] = []
    let numeros_4: string[] = []
    let redoblona: string | null = null

    try {
      const { data: v6Full } = await supabase.rpc("calculate_omega_v6" as never, {
        p_turno: turnoCanonical,
        p_tier: "premium",
        p_date: today,
      } as never)

      if (Array.isArray(v6Full) && v6Full.length > 0) {
        const first = v6Full[0] as Record<string, unknown>
        if (Array.isArray(first.prediccion_3cifras)) numeros_3 = first.prediccion_3cifras.map(String)
        if (Array.isArray(first.prediccion_4cifras)) numeros_4 = first.prediccion_4cifras.map(String)
        if (first.redoblona && typeof first.redoblona === "object") {
          const rb = first.redoblona as { cabeza: number; acompanante: number }
          redoblona = `${String(rb.cabeza).padStart(2, "0")}-${String(rb.acompanante).padStart(2, "0")}`
        }
      }
    } catch { /* non-fatal — 2 cifras is sufficient */ }

    const rows = toPredict.map(user => {
      const isPremium = user.role === "premium" || user.role === "admin"
      let numeros: string[]

      if (isPremium && (numeros_3.length > 0 || numeros_4.length > 0 || redoblona)) {
        numeros = [JSON.stringify({
          "2": numeros_2,
          "3": numeros_3,
          "4": numeros_4,
          "r": redoblona,
        })]
      } else {
        numeros = numeros_2
      }

      return {
        user_id: user.user_id,
        game_id: GAME_ID,
        date: today,
        turno: turnoCanonical,
        numeros,
        engine_version: engineVersion,
        confidence: top10[0]?.score || 0,
        status: "PENDING",
      }
    })

    // ── 5. Batch upsert in chunks ───────────────────────────────────
    const CHUNK_SIZE = 500
    const TIME_BUDGET_MS = 200_000
    let succeeded = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      if (Date.now() - t0 > TIME_BUDGET_MS) {
        failed += rows.length - i
        errors.push(`TIME_BUDGET: ${rows.length - i} users skipped`)
        break
      }

      const chunk = rows.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase
        .from("user_predictions")
        .upsert(chunk, { onConflict: "user_id,date,turno" })

      if (error) {
        errors.push(error.message)
        failed += chunk.length
      } else {
        succeeded += chunk.length
      }
    }

    // ── 6. Store in predictions_cache for fast API reads ─────────────
    try {
      await supabase.from("predictions_cache" as never).upsert({
        game_id: GAME_ID,
        date: today,
        turno: turnoCanonical,
        numeros_2: top10.map(p => ({ n: parseInt(p.numero), numero: p.numero, score: p.score, factor_attribution: p.factor_attribution })),
        engine_version: engineVersion,
        confidence: top10[0]?.score || 0,
        agreement_score: 0.8,
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never, { onConflict: "game_id,date,turno" })
    } catch { /* non-fatal — predictions are already in user_predictions */ }

    const elapsed = Date.now() - t0
    logger.info("[cron-autopilot] Completed", {
      turno: turnoCanonical,
      processed: succeeded,
      failed,
      skipped: eligible.length - toPredict.length,
      engine: engineVersion,
      predictionsCount: predictions.length,
      elapsed,
    })
    logCronExecution("cron-autopilot", {
      turno: turnoCanonical,
      processed: succeeded,
      failed,
      elapsed,
    }, t0)

    return NextResponse.json({
      ok: true,
      turno: turnoCanonical,
      date: today,
      processed: succeeded,
      failed,
      skipped: eligible.length - toPredict.length,
      total_eligible: eligible.length,
      engine: engineVersion,
      predictions: numeros_2,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e) {
    logger.error("[cron-autopilot] Fatal error", { turno, error: String(e) })
    logCronExecution("cron-autopilot", { turno, error: String(e) }, t0)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
