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
import { estadoQuiniela } from "@/lib/verificacion/auto-verify"
import logger from "@/lib/logger"

export const maxDuration = 120

const TODOS_TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const

function fechaArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format()
}

function normalizeTurno(t: string): string {
  const base = t.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** Normaliza campos de `numeros` que pueden llegar como array, string único o null. */
function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => x != null).map((x) => String(x))
  if (typeof v === "string" && v.trim().length > 0) {
    return v.split(",").map((s) => s.trim()).filter(Boolean)
  }
  return []
}

interface PredictionRow {
  id: string
  user_id: string
  date: string
  turno: string
  numeros: unknown
}

interface HistoryInsert {
  prediction_id: string
  user_id: string
  date: string
  turno: string
  numeros_2: string[]
  numeros_3: string[]
  numeros_4: string[]
  redoblonas: string[]
  resultado_oficial: number[]
  aciertos_2: { numero: string; puesto: number }[]
  aciertos_3: { numero: string; puesto: number }[]
  aciertos_4: { numero: string; puesto: number }[]
  aciertos_redoblona: { cabeza: string; acompanante: string }[]
  total_aciertos: number
  verified: boolean
  verified_at: string
  game_id: string
}

interface TurnoResult {
  turno: string
  status: "verified" | "no_draw" | "no_predictions" | "already_verified" | "error"
  verified?: number
  reason?: string
}

interface DrawRow {
  date?: string
  numbers: number[]
  game_id?: string | null
}

function deriveNums(numbers: number[]) {
  return {
    nums2: numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0")),
    nums3: numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0")),
    nums4: numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0")),
  }
}

/** Construye la fila de prediction_history para una predicción + SU sorteo. */
function buildHistoryInsert(pred: PredictionRow, draw: DrawRow): HistoryInsert {
  let numeros: unknown = pred.numeros
  if (Array.isArray(numeros) && numeros.length === 1 && typeof numeros[0] === "string") {
    try { numeros = JSON.parse(numeros[0] as string) } catch {}
  }

  let numeros_2: string[], numeros_3: string[], numeros_4: string[], redoblonas: string[]
  if (Array.isArray(numeros)) {
    numeros_2 = numeros.map((n: unknown) => String(n).padStart(2, "0"))
    numeros_3 = []
    numeros_4 = []
    redoblonas = []
  } else {
    const obj = (numeros ?? null) as Record<string, unknown> | null
    numeros_2 = toStrArray(obj?.["2"]).map((n) => n.padStart(2, "0"))
    numeros_3 = toStrArray(obj?.["3"]).map((n) => n.padStart(3, "0"))
    numeros_4 = toStrArray(obj?.["4"]).map((n) => n.padStart(4, "0"))
    redoblonas = toStrArray(obj?.["r"])
  }

  const { nums2, nums3, nums4 } = deriveNums(draw.numbers)

  const aciertos2 = numeros_2
    .filter((n: string) => nums2.includes(n))
    .map((n: string) => ({ numero: n, puesto: nums2.indexOf(n) + 1 }))

  const aciertos3 = numeros_3
    .filter((n: string) => nums3.includes(n))
    .map((n: string) => ({ numero: n, puesto: nums3.indexOf(n) + 1 }))

  const aciertos4 = numeros_4
    .filter((n: string) => nums4.includes(n))
    .map((n: string) => ({ numero: n, puesto: nums4.indexOf(n) + 1 }))

  const aciertosRedoblona: { cabeza: string; acompanante: string }[] = []
  for (const rb of redoblonas) {
    const parts = rb.split("-")
    if (parts.length === 2) {
      const cabeza = parts[0].padStart(2, "0")
      const acompanante = parts[1].padStart(2, "0")
      if (nums2.includes(cabeza) && nums2.includes(acompanante)) {
        aciertosRedoblona.push({ cabeza, acompanante })
      }
    }
  }

  const totalAciertos = aciertos2.length + aciertos3.length + aciertos4.length + aciertosRedoblona.length

  return {
    prediction_id: pred.id,
    user_id: pred.user_id,
    date: pred.date,
    turno: pred.turno,
    numeros_2,
    numeros_3,
    numeros_4,
    redoblonas,
    resultado_oficial: draw.numbers,
    aciertos_2: aciertos2,
    aciertos_3: aciertos3,
    aciertos_4: aciertos4,
    aciertos_redoblona: aciertosRedoblona,
    total_aciertos: totalAciertos,
    verified: true,
    verified_at: new Date().toISOString(),
    game_id: draw.game_id || "ac593199-c299-4f03-b1b7-8675fe4fa6d9",
  }
}

function posicionesDe(h: HistoryInsert): number[] {
  const positions2 = (h.aciertos_2 || []).map((a) => a.puesto)
  const positions3 = (h.aciertos_3 || []).map((a) => a.puesto)
  const positions4 = (h.aciertos_4 || []).map((a) => a.puesto)
  return [...new Set([...positions2, ...positions3, ...positions4])].filter((p) => p >= 1 && p <= 20)
}

/**
 * Estado final de una predicción. Criterio estricto alineado con la RPC
 * verify_predictions_for_draw: la rama TS antes usaba total_aciertos > 0
 * (87,9% de "WON" que el azar también alcanza).
 */
function estadoFinal(h: HistoryInsert, esPoceada: boolean): "WON" | "NEAR_MISS" | "LOST" {
  if (esPoceada) return h.total_aciertos >= 5 ? "WON" : "LOST"
  return estadoQuiniela(h.resultado_oficial, h.numeros_2)
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
