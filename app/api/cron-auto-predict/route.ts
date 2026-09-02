/**
 * /api/cron-auto-predict
 *
 * Generates predictions automatically for users with auto_predict_enabled=true.
 * Called by event-driven trigger (after scrape) or cron-job.org.
 *
 * Race Condition Guard:
 * - Validates that the PREVIOUS turno's draw exists in the database
 * - If not, returns 425 Too Early (scheduler should retry in 5 min)
 * - This prevents predicting with stale data when scraper is delayed
 *
 * Batch Architecture:
 * - Prediction computed ONCE per tier (free/premium)
 * - Results stored in memory
 * - Upserted in chunks of 500 (avoids Payload Too Large)
 *
 * Query params: ?turno=Previa|Primera|Matutina|Vespertina|Nocturna
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { validatePrerequisite, todayART } from "@/lib/quiniela-timeline"
import { esDiaSinSorteo } from "@/lib/feriados"
import { batchUpsert, buildPredictionRows } from "@/lib/batch-upsert"
import type { TurnoQuiniela } from "@/types/engine"
import logger from "@/lib/logger"

const VALID_TURNOS: TurnoQuiniela[] = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"

export const maxDuration = 240

interface PredictionData {
  numeros_2?: number[]
  numeros_3?: number[]
  numeros_4?: number[]
  redoblona?: unknown[]
}

interface UsersRow {
  user_id: string
  role: string
  predictions_used: number
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const turno = req.nextUrl.searchParams.get("turno") as TurnoQuiniela | null
  if (!turno || !VALID_TURNOS.includes(turno)) {
    return NextResponse.json({ error: "Invalid turno" }, { status: 400 })
  }

  // ── NO SORTeos on Sundays / holidays ──────────────────────────
  const today = todayART()
  const weekday = new Date(`${today}T12:00:00Z`).getDay()
  if (esDiaSinSorteo(today, weekday)) {
    return NextResponse.json({ ok: true, message: "Domingo/feriado — sin sorteos", processed: 0 })
  }

  const supabase = getSupabaseAdmin()

  try {
    // ── RACE CONDITION GUARD ───────────────────────────────────
    const validation = await validatePrerequisite(supabase, turno)

    if (!validation.valid) {
      logger.warn("[cron-auto-predict] Aborted — prerequisite not met", {
        turno,
        reason: validation.reason,
        expected: validation.expected,
      })
      return NextResponse.json(
        {
          ok: false,
          error: "Scraping incompleto",
          detail: validation.reason,
          expected: validation.expected,
          found: "found" in validation ? validation.found : null,
        },
        { status: 425 }
      )
    }

    const lastDrawId = validation.lastDrawId
    logger.info("[cron-auto-predict] Prerequisite validated", { turno, lastDrawId })

    // ── Get eligible users ─────────────────────────────────────
    const { data: users, error: usersError } = await supabase
      .rpc("get_auto_predict_users", { p_turno: turno })

    if (usersError) throw usersError
    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, message: "No auto-predict users", processed: 0 })
    }

    // Filter: ONLY premium users are eligible (auto-pilot is premium-only)
    const eligible: UsersRow[] = []
    const skippedUserIds: string[] = []

    for (const user of users as UsersRow[]) {
      const isPremium = user.role === "premium" || user.role === "admin"
      if (!isPremium) {
        skippedUserIds.push(user.user_id)
        continue
      }
      eligible.push(user)
    }

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, message: "All users already predicted", processed: 0, skipped: skippedUserIds.length })
    }

    // ── Compute prediction ONCE per tier (not per user) ────────
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "https://quiniela-ia-two.vercel.app"

    const tierResults = new Map<string, { pred: PredictionData; engine: string; confidence: number }>()

    async function fetchPrediction(isPremium: boolean) {
      const tierKey = isPremium ? "premium" : "free"
      if (tierResults.has(tierKey)) return tierResults.get(tierKey)!

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      try {
        const resp = await fetch(`${baseUrl}/api/predictions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            turno,
            date: todayART(),
            include3And4: isPremium,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout))

        if (!resp.ok) throw new Error(`Predictions API ${resp.status}`)
        const data = await resp.json()
        if (!data?.pred) throw new Error("No prediction data")

        const result = {
          pred: data.pred as PredictionData,
          engine: data.engine || "auto_pilot",
          confidence: data.confidence || 0,
        }
        tierResults.set(tierKey, result)
        return result
      } catch (e) {
        clearTimeout(timeout)
        throw e
      }
    }

    // ── Separate users by tier ─────────────────────────────────
    const freeUsers: UsersRow[] = []
    const premiumUsers: UsersRow[] = []

    for (const user of eligible) {
      const isPremium = user.role === "premium" || user.role === "admin"
      if (isPremium) {
        premiumUsers.push(user)
      } else {
        freeUsers.push(user)
      }
    }

    // ── Compute predictions per tier ───────────────────────────
    let freePrediction: { pred: PredictionData; engine: string; confidence: number } | null = null
    let premiumPrediction: { pred: PredictionData; engine: string; confidence: number } | null = null

    if (freeUsers.length > 0) {
      freePrediction = await fetchPrediction(false)
    }
    if (premiumUsers.length > 0) {
      premiumPrediction = await fetchPrediction(true)
    }

    // ── Build rows in memory (zero network latency) ────────────
    const allRows: Array<{
      user_id: string
      game_id: string
      date: string
      turno: string
      numeros: string[]
      engine_version: string
      confidence: number | null
    }> = []

    if (freePrediction && freeUsers.length > 0) {
      allRows.push(...buildPredictionRows(
        freeUsers,
        { numeros_2: (freePrediction.pred.numeros_2 || []).map(String) },
        { game_id: GAME_ID, date: todayART(), turno, engine_version: freePrediction.engine, confidence: freePrediction.confidence },
      ))
    }

    if (premiumPrediction && premiumUsers.length > 0) {
      allRows.push(...buildPredictionRows(
        premiumUsers,
        {
          numeros_2: (premiumPrediction.pred.numeros_2 || []).map(String),
          numeros_3: (premiumPrediction.pred.numeros_3 || []).map(String),
          numeros_4: (premiumPrediction.pred.numeros_4 || []).map(String),
          redoblona: (premiumPrediction.pred.redoblona as unknown as string) || null,
        },
        { game_id: GAME_ID, date: todayART(), turno, engine_version: premiumPrediction.engine, confidence: premiumPrediction.confidence },
      ))
    }

    // ── Batch upsert in chunks of 500 ─────────────────────────
    const batchResult = await batchUpsert("user_predictions", allRows, {
      onConflict: "user_id,date,turno",
    })

    // ── Log results ────────────────────────────────────────────
    try {
      await supabase.from("auto_predict_log").insert({
        turno,
        date: todayART(),
        status: batchResult.failed > 0 ? "partial" : "success",
        usuarios_afectados: batchResult.succeeded,
        errores: batchResult.errors.length > 0 ? batchResult.errors : null,
      })
    } catch { /* noop */ }

    const skipped = skippedUserIds.length
    logger.info("[cron-auto-predict] Completed", {
      turno,
      processed: batchResult.succeeded,
      failed: batchResult.failed,
      skipped,
      lastDrawId,
    })
    logCronExecution("cron-auto-predict", {
      turno,
      processed: batchResult.succeeded,
      failed: batchResult.failed,
      skipped,
      lastDrawId,
    }, t0)

    return NextResponse.json({
      ok: true,
      turno,
      processed: batchResult.succeeded,
      failed: batchResult.failed,
      skipped,
      total: users.length,
      lastDrawId,
      errors: batchResult.errors.length > 0 ? batchResult.errors : undefined,
    })
  } catch (e) {
    logger.error("[cron-auto-predict] Fatal error", { turno, error: String(e) })
    logCronExecution("cron-auto-predict", { turno, error: String(e) }, t0)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
