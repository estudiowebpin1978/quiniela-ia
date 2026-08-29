/**
 * Cron: Fast prediction verification
 *
 * Dedicated endpoint that verifies user predictions against official draws.
 * Runs every 5 min via cron-job.org — catches predictions immediately after
 * draws are saved by cron-scrape.
 *
 * Uses the SAME draw data already in the DB (scraped by cron-scrape).
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 120

function fechaArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format()
}

function turnoActualArgentina(): string {
  const now = new Date()
  const argStr = now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  const argDate = new Date(argStr)
  const h = argDate.getHours()
  const m = argDate.getMinutes()
  const totalMin = h * 60 + m

  if (totalMin >= 600 && totalMin < 705) return "Previa"
  if (totalMin >= 705 && totalMin < 870) return "Primera"
  if (totalMin >= 870 && totalMin < 1050) return "Matutina"
  if (totalMin >= 1050 && totalMin < 1230) return "Vespertina"
  return "Nocturna"
}

function normalizeTurno(t: string): string {
  const base = t.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
  return base.charAt(0).toUpperCase() + base.slice(1)
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

export async function GET(req: NextRequest) {
  const t0 = Date.now()

  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const overrideDate = req.nextUrl.searchParams.get("date")
  const fecha = (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) ? overrideDate : fechaArgentina()
  const turnoParam = req.nextUrl.searchParams.get("turno")
  const turno = turnoParam || turnoActualArgentina()
  const catchupParam = req.nextUrl.searchParams.get("catchup")
  const catchupDays = catchupParam ? Math.min(parseInt(catchupParam) || 3, 7) : 0

  if (!["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"].includes(turno)) {
    return NextResponse.json({ error: `Turno inválido: ${turno}` }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 1. Get draw numbers for this turno
  const { data: draws } = await supabase
    .from("draws")
    .select("numbers, turno, game_id")
    .eq("date", fecha)
    .ilike("turno", turno)
    .limit(1)

  if (!draws?.length || !draws[0].numbers?.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `No hay sorteo para ${turno} en ${fecha}`,
      elapsed_ms: Date.now() - t0,
    })
  }

  const draw = draws[0]
  const nums2 = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
  const nums3 = draw.numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
  const nums4 = draw.numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

  // 2. Get all predictions for this date + catch-up dates if enabled
  const dates = [fecha]
  if (catchupDays > 0) {
    for (let d = 1; d <= catchupDays; d++) {
      const past = new Date()
      past.setDate(past.getDate() - d)
      dates.push(past.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }))
    }
  }
  
  const { data: allPredictions } = await supabase
    .from("user_predictions")
    .select("id, user_id, date, turno, numeros")
    .in("date", dates)
    .or("status.eq.PENDING,status.is.null")
    .in("turno", [turno])

  if (!allPredictions?.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `No hay predicciones para ${fecha}`,
      elapsed_ms: Date.now() - t0,
    })
  }

  // Filter to matching turno
  const normalizedTurno = normalizeTurno(turno)
  const predictions = (allPredictions as PredictionRow[]).filter((p) =>
    normalizeTurno(p.turno || "") === normalizedTurno
  )

  if (!predictions.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `No hay predicciones para turno ${turno} en ${fecha}`,
      elapsed_ms: Date.now() - t0,
    })
  }

  // 3. Check which are already verified
  const predIds = predictions.map((p: { id: string }) => p.id).filter(Boolean)
  const { data: existing } = await supabase
    .from("prediction_history")
    .select("prediction_id")
    .in("prediction_id", predIds)

  const verifiedSet = new Set((existing || []).map((e: { prediction_id: string }) => e.prediction_id))

  // 4. Verify each unverified prediction
  const historyInserts: HistoryInsert[] = []
  let verifiedCount = 0

  for (const pred of predictions) {
    if (verifiedSet.has(pred.id)) continue

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
      const obj = numeros as Record<string, string[]> | null
      numeros_2 = (obj?.["2"] || []).map((n: string) => String(n).padStart(2, "0"))
      numeros_3 = (obj?.["3"] || []).map((n: string) => String(n).padStart(3, "0"))
      numeros_4 = (obj?.["4"] || []).map((n: string) => String(n).padStart(4, "0"))
      redoblonas = (obj?.["r"] || []).map((n: string) => String(n))
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
    verifiedCount++
  }

  // 5. Batch insert history
  if (historyInserts.length > 0) {
    const { error: insertErr } = await supabase.from("prediction_history").insert(historyInserts)
    if (insertErr) {
      logger.error("[cron-verify] insert error", { error: insertErr.message })
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // 5b. Batch update user_predictions (1 call instead of N)
    const predUpdates = historyInserts.map((h) => {
      const positions2 = (h.aciertos_2 || []).map((a: {puesto:number}) => a.puesto)
      const positions3 = (h.aciertos_3 || []).map((a: {puesto:number}) => a.puesto)
      const positions4 = (h.aciertos_4 || []).map((a: {puesto:number}) => a.puesto)
      const aciertosArr = [...new Set([...positions2, ...positions3, ...positions4])].filter((p: number) => p >= 1 && p <= 20)
      return {
        id: h.prediction_id,
        status: h.total_aciertos > 0 ? "WON" : "LOST",
        aciertos: aciertosArr,
        verified_at: h.verified_at,
      }
    })

    const { error: batchUpdErr } = await supabase
      .from("user_predictions")
      .upsert(predUpdates, { onConflict: "id" })

    if (batchUpdErr) {
      logger.error("[cron-verify] batch update predictions error", { error: batchUpdErr.message })
    }

    // 5c. Batch update user_stats via single RPC with arrays
    const userIds = historyInserts.map((h) => h.user_id).filter(Boolean)
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

  logCronExecution("cron-verify", {
    fecha,
    turno,
    verified: verifiedCount,
    alreadyVerified: verifiedSet.size,
    totalPredictions: predictions.length,
  }, t0)

  return NextResponse.json({
    ok: true,
    fecha,
    turno,
    verified: verifiedCount,
    alreadyVerified: verifiedSet.size,
    totalPredictions: predictions.length,
    elapsed_ms: Date.now() - t0,
  })
}
