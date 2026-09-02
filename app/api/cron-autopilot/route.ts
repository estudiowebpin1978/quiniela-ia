/**
 * /api/cron-autopilot
 *
 * CLOSED-LOOP AUTOMATION — FASE 2: Piloto Automático
 *
 * Corre 15 minutos ANTES de cada sorteo.
 * Lee las predicciones pre-calculadas del cache y las asigna
 * a los usuarios Premium que tengan auto_predict_enabled=true.
 *
 * Timing (ART → UTC):
 *   Previa:     10:00 ART → 13:00 UTC
 *   Primera:    11:45 ART → 14:45 UTC
 *   Matutina:   14:45 ART → 17:45 UTC
 *   Vespertina: 17:45 ART → 20:45 UTC
 *   Nocturna:   20:45 ART → 23:45 UTC
 *
 * Arquitectura:
 *   1. Busca usuarios premium con autopilot activo
 *   2. Lee predicciones de predictions_cache (pre-computadas)
 *   3. Inserta en user_predictions con status='PENDING'
 *   4. El trigger trg_verify_on_official_draw se encarga de verificar
 *      cuando el scraper guarde el resultado oficial.
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
    // ── 1. Buscar usuarios elegibles (premium + auto_predict_enabled) ──
    const { data: rawUsers, error: usersError } = await supabase
      .from("user_profiles")
      .select("id, email, role, premium_until, auto_predict_enabled")
      .eq("auto_predict_enabled", true)
      .or(`premium_until.is.null,premium_until.gt.${new Date().toISOString()}`)

    if (usersError) throw usersError
    if (!rawUsers || rawUsers.length === 0) {
      return NextResponse.json({ ok: true, message: "No autopilot users", processed: 0 })
    }

    // Filter: ONLY premium/admin users (auto-pilot is premium-only)
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

    // ── 2. Verificar que ya existen predicciones pre-calculadas ──
    const { data: cached, error: cacheError } = await supabase
      .from("predictions_cache")
      .select("numeros_2, numeros_3, numeros_4, redoblona, engine_version, confidence")
      .eq("game_id", GAME_ID)
      .eq("date", today)
      .eq("turno", turnoCanonical)
      .single()

    if (cacheError || !cached?.numeros_2 || !Array.isArray(cached.numeros_2) || cached.numeros_2.length === 0) {
      logger.warn("[cron-autopilot] No cached predictions", { turno: turnoCanonical, date: today })
      return NextResponse.json({
        ok: false,
        error: "Sin predicciones pre-calculadas en cache",
        detail: "El cron-precompute debe correr antes que el autopilot",
        retry_in_seconds: 60,
      }, {
        status: 425,
        headers: { "Retry-After": "60" },
      })
    }

    // ── 3. Extraer predicciones del cache ──
    const numeros_2: string[] = cached.numeros_2.map((item: Record<string, unknown>) => {
      const n = item.numero ?? item.n
      return String(n).padStart(2, "0")
    })

    const numeros_3: string[] = cached.numeros_3 || []
    const numeros_4: string[] = cached.numeros_4 || []
    const redoblona: string | null = cached.redoblona
      ? `${String(cached.redoblona.cabeza).padStart(2, "0")}-${String(cached.redoblona.acompanante).padStart(2, "0")}`
      : null

    const engineVersion = cached.engine_version || "meta-ensemble-v1"
    const confidence = cached.confidence || 0

    // ── 4. Verificar qué usuarios ya tienen predicciones para esta fecha+turno ──
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

    // ── 5. Construir filas de predicciones ──
    const rows = toPredict.map(user => {
      // Premium: store JSON with 2/3/4 cifras + redoblona
      const isPremium = user.role === "premium" || user.role === "admin"
      let numeros: string[]

      if (isPremium && numeros_3.length > 0) {
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
        confidence,
        status: "PENDING",
      }
    })

    // ── 6. Batch upsert en chunks de 1000 con time-budget ──
    const CHUNK_SIZE = 1000
    const TIME_BUDGET_MS = 200_000 // Leave 40s buffer from 240s maxDuration
    let succeeded = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      // Time-budget check: abort if approaching Vercel limit
      if (Date.now() - t0 > TIME_BUDGET_MS) {
        logger.warn("[cron-autopilot] Time budget exhausted", {
          elapsed: Date.now() - t0,
          remaining: rows.length - i,
        })
        failed += rows.length - i
        errors.push(`TIME_BUDGET: ${rows.length - i} users skipped (elapsed ${Date.now() - t0}ms)`)
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

    // ── 7. Log results ──
    try {
      await supabase.from("auto_predict_log").insert({
        turno: turnoCanonical,
        date: today,
        status: failed > 0 ? "partial" : "success",
        usuarios_afectados: succeeded,
        errores: errors.length > 0 ? errors : null,
      })
    } catch { /* noop */ }

    const elapsed = Date.now() - t0
    logger.info("[cron-autopilot] Completed", {
      turno: turnoCanonical,
      processed: succeeded,
      failed,
      skipped: eligible.length - toPredict.length,
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
      cached_at: cached.engine_version,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e) {
    logger.error("[cron-autopilot] Fatal error", { turno, error: String(e) })
    logCronExecution("cron-autopilot", { turno, error: String(e) }, t0)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
