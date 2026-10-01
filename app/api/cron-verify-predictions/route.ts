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

// ─── Verify a single turno for a given fecha ────────────────────────────────

async function verificarTurno(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fecha: string,
  turno: string,
  dates: string[],
): Promise<TurnoResult> {
  // 1. Get draw numbers for this turno
  const { data: draws } = await supabase
    .from("draws")
    .select("numbers, turno, game_id")
    .eq("date", fecha)
    .ilike("turno", turno)
    .limit(1)

  if (!draws?.length || !draws[0].numbers?.length) {
    return { turno, status: "no_draw", reason: `No hay sorteo para ${turno} en ${fecha}` }
  }

  const draw = draws[0]
  const nums2 = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
  const nums3 = draw.numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
  const nums4 = draw.numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

  // 2. Get PENDING predictions for this turno (incl. catch-up dates)
  const { data: allPredictions } = await supabase
    .from("user_predictions")
    .select("id, user_id, date, turno, numeros")
    .in("date", dates)
    .or("status.eq.PENDING,status.is.null")
    .in("turno", [turno])

  if (!allPredictions?.length) {
    return { turno, status: "no_predictions", reason: `No hay predicciones pendientes para ${fecha}` }
  }

  const normalizedTurno = normalizeTurno(turno)
  const predictions = (allPredictions as PredictionRow[]).filter(
    (p) => normalizeTurno(p.turno || "") === normalizedTurno,
  )

  if (!predictions.length) {
    return { turno, status: "no_predictions", reason: `No hay predicciones para turno ${turno} en ${fecha}` }
  }

  // 3. Check which are already verified
  const predIds = predictions.map((p) => p.id).filter(Boolean)
  const { data: existing } = await supabase
    .from("prediction_history")
    .select("prediction_id")
    .in("prediction_id", predIds)

  const verifiedSet = new Set((existing || []).map((e) => e.prediction_id))
  const unverified = predictions.filter((p) => !verifiedSet.has(p.id))

  if (unverified.length === 0) {
    return { turno, status: "already_verified", verified: 0, reason: `${verifiedSet.size} ya verificadas` }
  }

  // 4. Verify each unverified prediction
  const historyInserts: HistoryInsert[] = []

  for (const pred of unverified) {
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

    historyInserts.push({
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
    })
  }

  // 5. Batch insert history
  let predUpdateErrors = 0
  if (historyInserts.length > 0) {
    const { error: insertErr } = await supabase.from("prediction_history").insert(historyInserts)
    if (insertErr) {
      logger.error("[cron-verify] insert error", { error: insertErr.message, turno })
      return { turno, status: "error", reason: insertErr.message }
    }

    // 5b. Batch update user_predictions
    // NOTE: supabase upsert(onConflict:"id") fails on this table (not-null date
    // violation on the insert path) — use explicit updates keyed by id instead.
    const isPoceada = turno === "Poceada" || draw.game_id === "d0e1f2a3-b4c5-6789-0abc-def012345678"
    for (const h of historyInserts) {
      const positions2 = (h.aciertos_2 || []).map((a) => a.puesto)
      const positions3 = (h.aciertos_3 || []).map((a) => a.puesto)
      const positions4 = (h.aciertos_4 || []).map((a) => a.puesto)
      const aciertosArr = [...new Set([...positions2, ...positions3, ...positions4])].filter((p) => p >= 1 && p <= 20)
      const won = isPoceada ? h.total_aciertos >= 5 : h.total_aciertos > 0

      const { error: updErr } = await supabase
        .from("user_predictions")
        .update({ status: won ? "WON" : "LOST", aciertos: aciertosArr, verified_at: h.verified_at })
        .eq("id", h.prediction_id)

      if (updErr) {
        predUpdateErrors++
        logger.error("[cron-verify] update user_predictions error", { error: updErr.message, turno, predId: h.prediction_id })
      }
    }

    // 5c. Batch update user_stats via single RPC with arrays
    const hitsMap = new Map<string, number>()
    for (const h of historyInserts) {
      if (!h.user_id) continue
      hitsMap.set(h.user_id, (hitsMap.get(h.user_id) || 0) + h.total_aciertos)
    }

    for (const [userId, totalHits] of hitsMap) {
      try {
        await supabase.rpc("increment_user_stats" as never, {
          p_user_id: userId,
          p_predictions_increment: 1,
          p_hits_increment: totalHits,
          p_is_hit: totalHits > 0,
          p_verified_at: new Date().toISOString(),
        } as never)
      } catch (e) {
        logger.error("[cron-verify] Failed to update user_stats", { userId, error: String(e) })
      }
    }
  }

  if (predUpdateErrors > 0) {
    return { turno, status: "error", verified: historyInserts.length, reason: `${predUpdateErrors} user_predictions updates failed` }
  }

  return { turno, status: "verified", verified: historyInserts.length }
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
