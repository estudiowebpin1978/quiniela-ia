import { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { updateMotorPerformance, ALL_MOTORS } from "@/lib/analisis/motor-performance"
import { POCEADA_GAME_ID } from "@/lib/config"
import {
  estadoFinal,
  normalizeTurno,
  posicionesDe,
  type HistoryInsert,
  type PredictionRow,
} from "./criterio"
import { buildHistoryInsert } from "./historial"
import logger from "@/lib/logger"

interface VerificationResult {
  id: string
  fecha: string
  turno: string
  aciertos_2: { numero: string; puesto: number }[]
  aciertos_3: { numero: string; puesto: number }[]
  aciertos_4: { numero: string; puesto: number }[]
  aciertos_redoblona: { cabeza: string; acompanante: string }[]
  total_aciertos: number
  resultado_oficial: number[]
}

/**
 * Stats exactamente una vez (auditoría 2026-10-05): SOLO filas realmente
 * insertadas en prediction_history (el upsert con ignoreDuplicates + select
 * devuelve las nuevas) → incremento atómico vía RPC, igual que
 * cron-verify-predictions. Antes: read-modify-write sobre TODAS las filas
 * procesadas → doble conteo cuando el otro verificador ya había insertado.
 */
async function incrementarStatsInsertadas(
  supabase: SupabaseClient,
  insertedRows: { prediction_id: string; user_id: string | null; total_aciertos: number }[],
  hById: Map<string, HistoryInsert>,
  esPoceada: boolean,
): Promise<void> {
  const porUsuario = new Map<string, { preds: number; hits: number; won: boolean }>()
  for (const r of insertedRows) {
    if (!r.user_id) continue
    const cur = porUsuario.get(r.user_id) || { preds: 0, hits: 0, won: false }
    cur.preds++
    cur.hits += r.total_aciertos || 0
    const h = hById.get(r.prediction_id)
    if (h) cur.won = cur.won || estadoFinal(h, esPoceada) === "WON"
    porUsuario.set(r.user_id, cur)
  }

  for (const [userId, s] of porUsuario) {
    try {
      await supabase.rpc("increment_user_stats" as never, {
        p_user_id: userId,
        p_predictions_increment: s.preds,
        p_hits_increment: s.hits,
        p_is_hit: s.won,
        p_verified_at: new Date().toISOString(),
      } as never)
    } catch (e) {
      logger.error("[auto-verify] Failed to update user_stats", { userId, error: String(e) })
    }
  }
}

async function _verifyPoceada(supabase: SupabaseClient, fecha: string, normalizedTurno: string, draw: { numbers: number[]; game_id?: string }): Promise<VerificationResult[]> {
  const { data: allPredictions } = await supabase
    .from("user_predictions")
    .select("id, user_id, date, turno, numeros")
    .eq("date", fecha)
    .or("status.eq.PENDING,status.is.null")

  if (!allPredictions?.length) return []

  const predictions = (allPredictions as PredictionRow[]).filter((p) => normalizeTurno(p.turno || "") === normalizedTurno)
  if (!predictions.length) return []

  const predIds = predictions.map((p) => p.id).filter(Boolean)
  const { data: existing } = await supabase
    .from("prediction_history")
    .select("prediction_id")
    .in("prediction_id", predIds)

  const verifiedSet = new Set((existing || []).map((e: { prediction_id: string }) => e.prediction_id))

  const results: VerificationResult[] = []
  const historyInserts: HistoryInsert[] = []
  // stats: read-modify-write eliminado — ver incrementarStatsInsertadas()
  // (solo filas realmente insertadas, vía RPC, igual que cron-verify).

  for (const pred of predictions) {
    if (verifiedSet.has(pred.id)) continue

    // Mismo constructor que cron-verify: parseo + matching unificados en
    // lib/verificacion/historial (con fallback de game_id de Poceada).
    const h = buildHistoryInsert(pred, draw, POCEADA_GAME_ID)
    historyInserts.push(h)

    results.push({
      id: pred.id,
      fecha,
      turno: pred.turno,
      aciertos_2: h.aciertos_2,
      aciertos_3: h.aciertos_3,
      aciertos_4: h.aciertos_4,
      aciertos_redoblona: h.aciertos_redoblona,
      total_aciertos: h.total_aciertos,
      resultado_oficial: h.resultado_oficial,
    })
  }

  if (historyInserts.length > 0) {
    // Idempotente bajo concurrencia (ver nota en la rama quiniela). El .select()
    // devuelve SOLO las filas realmente insertadas → stats exactamente una vez
    // aunque otro verificador concurrente ya hubiera escrito la fila.
    const { data: insertedRows, error: phErr } = await supabase
      .from("prediction_history")
      .upsert(historyInserts, { onConflict: "prediction_id", ignoreDuplicates: true })
      .select("prediction_id, user_id, total_aciertos")
    if (phErr) {
      logger.error("[auto-verify] Poceada history upsert error", { error: phErr.message })
      return []
    }

    // Poceada: WON con total_aciertos >= 5 — alineado con la RPC canónica
    // (verify_predictions_for_draw usa `count >= 5`; POCEADA_MATCHES.includes
    // [5..8] divergía para 9-10 aciertos, que la RPC marca WON).
    const wonIds = historyInserts.filter((h) => estadoFinal(h, true) === "WON").map((h) => h.prediction_id)
    const lostIds = historyInserts.filter((h) => estadoFinal(h, true) === "LOST").map((h) => h.prediction_id)
    const now = new Date().toISOString()

    if (wonIds.length > 0) {
      await supabase.from("user_predictions").update({ status: "WON", verified_at: now }).in("id", wonIds)
    }
    if (lostIds.length > 0) {
      await supabase.from("user_predictions").update({ status: "LOST", verified_at: now }).in("id", lostIds)
    }

    const hById = new Map(historyInserts.map((hh) => [hh.prediction_id, hh] as const))
    await incrementarStatsInsertadas(supabase, insertedRows || [], hById, true)
  }

  if (results.length > 0) {
    logger.info("[auto-verify] Verified Poceada predictions", { fecha, turno: normalizedTurno, count: results.length })
  }

  return results
}

export async function autoVerifyPredictions(fecha: string, turno: string, maxRetries = 2): Promise<VerificationResult[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await _autoVerifyInternal(supabase, fecha, turno)
    } catch (err: unknown) {
      if (attempt === maxRetries) {
        const e = err as { message?: string }
        logger.error("[auto-verify] Final attempt failed", { fecha, turno, attempt, error: e.message })
        return []
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  return []
}

async function _autoVerifyInternal(supabase: SupabaseClient, fecha: string, turno: string): Promise<VerificationResult[]> {
  const normalizedTurno = normalizeTurno(turno)

  const { data: draws } = await supabase
    .from("draws")
    .select("numbers, turno, game_id")
    .eq("date", fecha)
    .ilike("turno", normalizedTurno)

  if (!draws?.length) {
    logger.warn("[auto-verify] No draw found — skipping verification", { fecha, turno: normalizedTurno })
    return []
  }
  const draw = draws[0]

  if (!draw.numbers?.length) {
    logger.warn("[auto-verify] Draw exists but numbers empty — skipping", { fecha, turno: normalizedTurno })
    return []
  }

  const isPoceada = draw.game_id === POCEADA_GAME_ID || normalizedTurno === "Poceada"

  if (isPoceada) {
    return await _verifyPoceada(supabase, fecha, normalizedTurno, draw)
  }

  const { data: allPredictions } = await supabase
    .from("user_predictions")
    .select("id, user_id, date, turno, numeros")
    .eq("date", fecha)
    .or("status.eq.PENDING,status.is.null")

  if (!allPredictions?.length) return []

  const predictions = (allPredictions as PredictionRow[]).filter((p) => normalizeTurno(p.turno || "") === normalizedTurno)

  if (!predictions.length) return []

  const predIds = predictions.map((p) => p.id).filter(Boolean)
  const { data: existing } = await supabase
    .from("prediction_history")
    .select("prediction_id")
    .in("prediction_id", predIds)

  const verifiedSet = new Set((existing || []).map((e: { prediction_id: string }) => e.prediction_id))

  const results: VerificationResult[] = []
  const historyInserts: HistoryInsert[] = []
  // stats: read-modify-write eliminado — ver incrementarStatsInsertadas()
  // (solo filas realmente insertadas, vía RPC, igual que cron-verify).

  for (const pred of predictions) {
    if (verifiedSet.has(pred.id)) continue

    // Mismo constructor que cron-verify: parseo + matching (2C/3C/4C/redoblona)
    // + totales unificados en lib/verificacion/historial (fallback Nacional).
    const h = buildHistoryInsert(pred, draw)
    historyInserts.push(h)

    results.push({
      id: pred.id,
      fecha,
      turno: pred.turno,
      aciertos_2: h.aciertos_2,
      aciertos_3: h.aciertos_3,
      aciertos_4: h.aciertos_4,
      aciertos_redoblona: h.aciertos_redoblona,
      total_aciertos: h.total_aciertos,
      resultado_oficial: h.resultado_oficial,
    })
  }

  if (historyInserts.length > 0) {
    // upsert idempotente: cron-verify y auto-verify pueden procesar las mismas
    // filas; el unique (prediction_id) + ignoreDuplicates evita el fallo 23505
    // que antes tumbaba el lote completo. El .select() devuelve SOLO las filas
    // realmente insertadas → stats exactamente una vez bajo carrera.
    const { data: insertedRows, error: batchError } = await supabase
      .from("prediction_history")
      .upsert(historyInserts, { onConflict: "prediction_id", ignoreDuplicates: true })
      .select("prediction_id, user_id, total_aciertos")
    if (batchError) {
      // Sin history NO se marca la predicción: queda PENDING y el próximo
      // tick reintenta (evita "WON sin historial / sin aciertos").
      logger.error("[auto-verify] Batch upsert error", { error: batchError.message })
      return []
    }

    // Update por fila: status estricto (estadoFinal) + aciertos de posiciones
    // (antes faltaba el campo aciertos y no se contemplaba NEAR_MISS).
    for (const h of historyInserts) {
      const { error: updErr } = await supabase.from("user_predictions")
        .update({ status: estadoFinal(h, false), aciertos: posicionesDe(h), verified_at: h.verified_at })
        .eq("id", h.prediction_id)
      if (updErr) {
        logger.error("[auto-verify] status update failed", { error: updErr.message, predId: h.prediction_id })
      }
    }

    // Stats exactamente una vez: solo filas realmente insertadas → RPC atómica
    // (mismo patrón que cron-verify-predictions; antes read-modify-write sobre
    // user_stats que podía doble-contear bajo carrera con el otro verificador).
    const hById = new Map(historyInserts.map((hh) => [hh.prediction_id, hh] as const))
    await incrementarStatsInsertadas(supabase, insertedRows || [], hById, false)
  }

  if (results.length > 0) {
    logger.info("[auto-verify] Verified predictions", { fecha, turno: normalizedTurno, count: results.length })

    // Update motor performance: each motor gets the ensemble hit rate for this turno
    const avgHitRate = results.reduce((sum, r) => sum + (r.total_aciertos / 10), 0) / results.length
    for (const motor of ALL_MOTORS) {
      updateMotorPerformance(motor, normalizedTurno, avgHitRate).catch(() => {})
    }
  }

  return results
}

export async function getVerificationStats(userId?: string, days: number = 30) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  let query = supabase
    .from("prediction_history")
    .select("prediction_id, user_id, fecha, turno, total_aciertos, aciertos_2, aciertos_3, aciertos_4")
    .eq("verified", true)
    .gte("fecha", cutoff.toISOString().split("T")[0])

  if (userId) query = query.eq("user_id", userId)

  const { data } = await query

  if (!data?.length) {
    return {
      totalPredictions: 0,
      totalHits2: 0,
      totalHits3: 0,
      totalHits4: 0,
      hitRate2: 0,
      hitRate3: 0,
      hitRate4: 0,
      bestDay: null,
      currentStreak: 0,
      bestStreak: 0,
      byTurno: {},
    }
  }

  let totalHits2 = 0, totalHits3 = 0, totalHits4 = 0
  let currentStreak = 0, bestStreak = 0, tempStreak = 0
  const byTurno: Record<string, { preds: number; hits: number }> = {}

  for (const p of data) {
    const hits2 = Array.isArray(p.aciertos_2) ? p.aciertos_2.length : 0
    const hits3 = Array.isArray(p.aciertos_3) ? p.aciertos_3.length : 0
    const hits4 = Array.isArray(p.aciertos_4) ? p.aciertos_4.length : 0
    const totalHits = hits2 + hits3 + hits4

    totalHits2 += hits2
    totalHits3 += hits3
    totalHits4 += hits4

    if (totalHits > 0) {
      tempStreak++
      bestStreak = Math.max(bestStreak, tempStreak)
    } else {
      tempStreak = 0
    }

    const t = p.turno || "unknown"
    if (!byTurno[t]) byTurno[t] = { preds: 0, hits: 0 }
    byTurno[t].preds++
    byTurno[t].hits += totalHits
  }

  currentStreak = tempStreak

  return {
    totalPredictions: data.length,
    totalHits2,
    totalHits3,
    totalHits4,
    hitRate2: data.length > 0 ? Math.round((totalHits2 / data.length) * 100) : 0,
    hitRate3: data.length > 0 ? Math.round((totalHits3 / data.length) * 100) : 0,
    hitRate4: data.length > 0 ? Math.round((totalHits4 / data.length) * 100) : 0,
    currentStreak,
    bestStreak,
    byTurno,
  }
}
