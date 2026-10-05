/**
 * Cron: Fast prediction verification
 *
 * Dedicated endpoint that verifies user predictions against official draws.
 * Runs every 5 min via cron-job.org — catches predictions immediately after
 * draws are saved by cron-scrape.
 *
 * Verifies ALL turnos of the day that have an official draw + PENDING
 * predictions (no dependence on the current clock turno), so a late-arriving
 * draw (e.g. Nocturna) is verified on the next tick without waiting for a
 * specific time window.
 *
 * Uses the SAME draw data already in the DB (scraped by cron-scrape).
 *
 * Además, cuando el turno ya tiene sorteo oficial, registra la evaluación
 * de la efectividad de los factores V6 en factor_weight_history
 * (sección "Rendimiento por Factor" de /rendimiento). Idempotente: solo
 * escribe si falta la fila para esa fecha.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { ensureFactorHistory } from "@/lib/analisis/factor-evaluation"
import {
  TODOS_TURNOS,
  estadoFinal,
  normalizeTurno,
  posicionesDe,
  type DrawRow,
  type HistoryInsert,
  type PredictionRow,
} from "@/lib/verificacion/criterio"
import { buildHistoryInsert } from "@/lib/verificacion/historial"
import logger from "@/lib/logger"

export const maxDuration = 120

function fechaArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format()
}

interface TurnoResult {
  turno: string
  status: "verified" | "no_draw" | "no_predictions" | "already_verified" | "error"
  verified?: number
  reason?: string
}

// ─── Verify a single turno for a given fecha ────────────────────────────────

async function verificarTurno(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fecha: string,
  turno: string,
  dates: string[],
): Promise<TurnoResult> {
  // 1. Sorteos oficiales de la ventana (hoy + catch-up). CADA predicción se
  // verifica contra el sorteo de SU fecha (antes, con catch-up, se usaba el
  // sorteo de hoy para predicciones de días pasados → resultado_oficial falso).
  const { data: drawRows } = await supabase
    .from("draws")
    .select("numbers, turno, game_id, date")
    .in("date", dates)
    .ilike("turno", turno)

  const drawsByDate = new Map<string, DrawRow>()
  for (const d of (drawRows || []) as DrawRow[]) {
    if (d?.date && Array.isArray(d.numbers) && d.numbers.length > 0) drawsByDate.set(d.date, d)
  }

  if (!drawsByDate.has(fecha)) {
    return { turno, status: "no_draw", reason: `No hay sorteo para ${turno} en ${fecha}` }
  }

  // 2. Get PENDING predictions for this turno (incl. catch-up dates)
  const { data: allPredictions } = await supabase
    .from("user_predictions")
    .select("id, user_id, date, turno, numeros")
    .in("date", dates)
    .or("status.eq.PENDING,status.is.null")
    .in("turno", [turno])

  const normalizedTurno = normalizeTurno(turno)
  const predictions = ((allPredictions || []) as PredictionRow[]).filter(
    (p) => normalizeTurno(p.turno || "") === normalizedTurno,
  )

  let yaVerificadas = 0
  const historyInserts: HistoryInsert[] = []

  if (predictions.length > 0) {
    // 3. Check which are already verified
    const predIds = predictions.map((p) => p.id).filter(Boolean)
    const { data: existing } = await supabase
      .from("prediction_history")
      .select("prediction_id")
      .in("prediction_id", predIds)

    const verifiedSet = new Set((existing || []).map((e) => e.prediction_id))
    yaVerificadas = verifiedSet.size
    const unverified = predictions.filter((p) => !verifiedSet.has(p.id))

    // 4. Build history rows (una por predicción, contra SU sorteo)
    for (const pred of unverified) {
      const predDraw = drawsByDate.get(pred.date)
      if (!predDraw) continue // sin sorteo oficial para esa fecha aún
      historyInserts.push(buildHistoryInsert(pred, predDraw))
    }
  }

  // 4b. Backfill: filas con status ya marcado fuera de este flujo (la RPC
  // verify_predictions_for_draw marca status pero NO escribe prediction_history
  // ni stats) → poblar historial + stats exactamente una vez.
  const backfillInserts: HistoryInsert[] = []
  const backfillSinAciertos: HistoryInsert[] = []
  try {
    const { data: marcadas } = await supabase
      .from("user_predictions")
      .select("id, user_id, date, turno, numeros, aciertos")
      .in("date", dates)
      .in("turno", [turno])
      .in("status", ["WON", "LOST", "NEAR_MISS"])

    const marcadasRows = (marcadas || []) as (PredictionRow & { aciertos: number[] | null })[]
    if (marcadasRows.length > 0) {
      const { data: existing2 } = await supabase
        .from("prediction_history")
        .select("prediction_id")
        .in("prediction_id", marcadasRows.map((r) => r.id))
      const have = new Set((existing2 || []).map((e) => e.prediction_id))
      for (const r of marcadasRows) {
        if (have.has(r.id)) continue
        const predDraw = drawsByDate.get(r.date)
        if (!predDraw) continue
        const h = buildHistoryInsert(r, predDraw)
        backfillInserts.push(h)
        if (!Array.isArray(r.aciertos) || r.aciertos.length === 0) backfillSinAciertos.push(h)
      }
    }
  } catch (e) {
    logger.warn("[cron-verify] backfill scan failed", { turno, error: String(e) })
  }

  const totalInserts = [...historyInserts, ...backfillInserts]

  if (totalInserts.length === 0) {
    if (yaVerificadas > 0) {
      return { turno, status: "already_verified", verified: 0, reason: `${yaVerificadas} ya verificadas` }
    }
    return { turno, status: "no_predictions", reason: `No hay predicciones pendientes para ${fecha}` }
  }

  // 5. upsert idempotente: dos verificadores concurrentes (cron-verify +
  // auto-verify) no duplican filas (unique prediction_id + ignoreDuplicates) y
  // SOLO el escritor que realmente inserta incrementa stats → exactamente una
  // vez bajo carrera. Antes: .insert() en lote → 23505 tumbaba todo el lote.
  let predUpdateErrors = 0
  const { data: insertedRows, error: insertErr } = await supabase
    .from("prediction_history")
    .upsert(totalInserts, { onConflict: "prediction_id", ignoreDuplicates: true })
    .select("prediction_id, user_id, total_aciertos")

  if (insertErr) {
    logger.error("[cron-verify] upsert error", { error: insertErr.message, turno })
    return { turno, status: "error", reason: insertErr.message }
  }

  const insertedIds = new Set<string>(
    ((insertedRows || []) as { prediction_id: string }[]).map((r) => r.prediction_id),
  )
  const hById = new Map(totalInserts.map((h) => [h.prediction_id, h] as const))
  const esPoceada = (h: HistoryInsert) =>
    turno === "Poceada" || h.game_id === "d0e1f2a3-b4c5-6789-0abc-def012345678"

  // 5b. status estricto SOLO para filas que venían de PENDING (el backfill ya
  // tiene status marcado por la RPC y no se toca). Antes: total_aciertos > 0.
  for (const h of historyInserts) {
    const estado = estadoFinal(h, esPoceada(h))
    const { error: updErr } = await supabase
      .from("user_predictions")
      .update({ status: estado, aciertos: posicionesDe(h), verified_at: h.verified_at })
      .eq("id", h.prediction_id)

    if (updErr) {
      predUpdateErrors++
      logger.error("[cron-verify] update user_predictions error", { error: updErr.message, turno, predId: h.prediction_id })
    }
  }

  // 5c. Completar aciertos en filas del backfill (la RPC deja aciertos NULL
  // en quiniela → "predicción verificada sin aciertos").
  for (const h of backfillSinAciertos) {
    if (!insertedIds.has(h.prediction_id)) continue
    const { error: acErr } = await supabase
      .from("user_predictions")
      .update({ aciertos: posicionesDe(h) })
      .eq("id", h.prediction_id)
    if (acErr) logger.warn("[cron-verify] backfill aciertos failed", { turno, error: acErr.message })
  }

  // 5d. stats: EXACTAMENTE UNA VEZ — solo filas realmente insertadas por esta
  // corrida (el upsert con ignoreDuplicates devuelve solo las nuevas).
  const statsPorUsuario = new Map<string, { preds: number; hits: number; won: boolean }>()
  for (const r of ((insertedRows || []) as { prediction_id: string; user_id: string | null; total_aciertos: number }[])) {
    if (!r.user_id) continue
    const h = hById.get(r.prediction_id)
    const estado = h ? estadoFinal(h, esPoceada(h)) : "LOST"
    const cur = statsPorUsuario.get(r.user_id) || { preds: 0, hits: 0, won: false }
    cur.preds++
    cur.hits += r.total_aciertos || 0
    cur.won = cur.won || estado === "WON"
    statsPorUsuario.set(r.user_id, cur)
  }

  for (const [userId, s] of statsPorUsuario) {
    try {
      await supabase.rpc("increment_user_stats" as never, {
        p_user_id: userId,
        p_predictions_increment: s.preds,
        p_hits_increment: s.hits,
        p_is_hit: s.won,
        p_verified_at: new Date().toISOString(),
      } as never)
    } catch (e) {
      logger.error("[cron-verify] Failed to update user_stats", { userId, error: String(e) })
    }
  }

  const backfilled = backfillInserts.filter((h) => insertedIds.has(h.prediction_id)).length
  const verifiedTotal = historyInserts.length + backfilled

  if (predUpdateErrors > 0) {
    return { turno, status: "error", verified: verifiedTotal, reason: `${predUpdateErrors} user_predictions updates failed` }
  }

  return { turno, status: "verified", verified: verifiedTotal }
}

// ─── Main endpoint ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const t0 = Date.now()

  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const overrideDate = req.nextUrl.searchParams.get("date")
  const fecha = (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) ? overrideDate : fechaArgentina()
  const turnoParam = req.nextUrl.searchParams.get("turno")
  const catchupParam = req.nextUrl.searchParams.get("catchup")
  const catchupDays = catchupParam ? Math.min(parseInt(catchupParam) || 3, 7) : 0

  let turnos: string[]
  if (turnoParam) {
    if (!TODOS_TURNOS.includes(turnoParam as (typeof TODOS_TURNOS)[number])) {
      return NextResponse.json({ error: `Turno inválido: ${turnoParam}` }, { status: 400 })
    }
    turnos = [turnoParam]
  } else {
    // Default: verify ALL turnos of the day (late draws get caught next tick)
    turnos = [...TODOS_TURNOS]
  }

  const supabase = getSupabaseAdmin()

  // Dates: today + catch-up window
  const dates = [fecha]
  if (catchupDays > 0) {
    for (let d = 1; d <= catchupDays; d++) {
      const past = new Date()
      past.setDate(past.getDate() - d)
      dates.push(past.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }))
    }
  }

  // Verify each turno independently (fast no-op when no draw/predictions)
  const porTurno: TurnoResult[] = []
  let totalVerified = 0
  let totalErrors = 0

  for (const turno of turnos) {
    try {
      const r = await verificarTurno(supabase, fecha, turno, dates)
      porTurno.push(r)
      if (r.status === "verified") totalVerified += r.verified || 0
      if (r.status === "error") totalErrors++

      // Evaluar la efectividad de los factores V6 contra el sorteo del día
      // (no bloqueante en el resultado de verificación; idempotente)
      if (r.status !== "no_draw") {
        try {
          const evaluacion = await ensureFactorHistory(turno, fecha, supabase)
          if (evaluacion) {
            logger.info("[cron-verify] evaluación de factores guardada", {
              turno,
              fecha,
              hitRate: Math.round(evaluacion.hitRate * 100),
              samples: evaluacion.samples,
            })
          }
        } catch (e) {
          logger.warn("[cron-verify] evaluación de factores falló", { turno, error: String(e) })
        }
      }
    } catch (e) {
      porTurno.push({ turno, status: "error", reason: String(e) })
      totalErrors++
      logger.error("[cron-verify] turno exception", { turno, error: String(e) })
    }
  }

  const verifiedTurnos = porTurno.filter((r) => r.status === "verified").map((r) => r.turno)

  logCronExecution("cron-verify", {
    fecha,
    turnos,
    verified: totalVerified,
    verifiedTurnos,
    errors: totalErrors,
  }, t0)

  return NextResponse.json({
    ok: totalErrors === 0,
    fecha,
    turnosChecked: turnos,
    verified: totalVerified,
    verifiedTurnos,
    totalErrors,
    porTurno,
    elapsed_ms: Date.now() - t0,
  })
}
