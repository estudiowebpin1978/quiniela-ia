import { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { updateMotorPerformance, ALL_MOTORS } from "@/lib/analisis/motor-performance"
import logger from "@/lib/logger"

interface ParsedNumeros {
  numeros_2: string[]
  numeros_3: string[]
  numeros_4: string[]
  redoblonas: string[]
}

interface PredictionRow {
  id: string
  user_id: string
  date: string
  turno: string
  numeros: unknown
}

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

interface UserStats {
  user_id: string
  total_predictions: number
  total_hits: number
  current_streak: number
  best_streak: number
  last_verified?: string
}

function parseNumeros(numeros: unknown): ParsedNumeros {
  let data: unknown = numeros
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
    try { data = JSON.parse(data[0] as string) } catch {}
  }
  if (Array.isArray(data)) {
    return { numeros_2: data.map((n: unknown) => String(n).padStart(2, "0")), numeros_3: [], numeros_4: [], redoblonas: [] }
  }
  const obj = data as Record<string, string[]> | null
  return {
    numeros_2: (obj?.["2"] || []).map((n: string) => String(n).padStart(2, "0")),
    numeros_3: (obj?.["3"] || []).map((n: string) => String(n).padStart(3, "0")),
    numeros_4: (obj?.["4"] || []).map((n: string) => String(n).padStart(4, "0")),
    redoblonas: (obj?.["r"] || []).map((n: string) => String(n)),
  }
}

function normalizeTurno(t: string): string {
  const base = t.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
  return base.charAt(0).toUpperCase() + base.slice(1)
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

  const nums2 = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
  const nums3 = draw.numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
  const nums4 = draw.numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

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
  const statsUpdates = new Map<string, UserStats>()

  const userIds = [...new Set(predictions.map((p) => p.user_id).filter(Boolean))]
  const { data: allStats } = userIds.length > 0
    ? await supabase.from("user_stats").select("user_id, total_predictions, total_hits, best_streak, current_streak").in("user_id", userIds)
    : { data: [] }
  const statsMap = new Map<string, UserStats>()
  for (const s of (allStats || [])) statsMap.set(s.user_id, s)

  for (const pred of predictions) {
    if (verifiedSet.has(pred.id)) continue

    const { numeros_2, numeros_3, numeros_4, redoblonas } = parseNumeros(pred.numeros)

    const aciertos2 = numeros_2
      .filter((n: string) => nums2.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums2.indexOf(n) + 1 }))

    const aciertos3 = numeros_3
      .filter((n: string) => nums3.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums3.indexOf(n) + 1 }))

    const aciertos4 = numeros_4
      .filter((n: string) => nums4.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums4.indexOf(n) + 1 }))

    // Verify redoblonas: check if both cabeza and acompanante appear in official results
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

    if (pred.user_id) {
      const prev = statsMap.get(pred.user_id) || { total_predictions: 0, total_hits: 0, best_streak: 0, current_streak: 0 }
      const newStreak = totalAciertos > 0 ? prev.current_streak + 1 : 0
      statsMap.set(pred.user_id, {
        user_id: pred.user_id,
        total_predictions: prev.total_predictions + 1,
        total_hits: prev.total_hits + totalAciertos,
        current_streak: newStreak,
        best_streak: Math.max(prev.best_streak, newStreak),
        last_verified: new Date().toISOString(),
      })
    }

    results.push({
      id: pred.id,
      fecha,
      turno: pred.turno,
      aciertos_2: aciertos2,
      aciertos_3: aciertos3,
      aciertos_4: aciertos4,
      aciertos_redoblona: aciertosRedoblona,
      total_aciertos: totalAciertos,
      resultado_oficial: draw.numbers,
    })
  }

  if (historyInserts.length > 0) {
    const { error: batchError } = await supabase.from("prediction_history").insert(historyInserts)
    if (batchError) {
      logger.error("[auto-verify] Batch insert error", { error: batchError.message })
    }

    const statusUpdates = historyInserts.map(h => {
      // Collect positions from ALL cifra types (2, 3, 4)
      const positions2 = Array.isArray(h.aciertos_2)
        ? h.aciertos_2.map((a: { puesto: number }) => a.puesto).filter((p: number) => p >= 1 && p <= 20)
        : []
      const positions3 = Array.isArray(h.aciertos_3)
        ? h.aciertos_3.map((a: { puesto: number }) => a.puesto).filter((p: number) => p >= 1 && p <= 20)
        : []
      const positions4 = Array.isArray(h.aciertos_4)
        ? h.aciertos_4.map((a: { puesto: number }) => a.puesto).filter((p: number) => p >= 1 && p <= 20)
        : []
      const allPositions = [...new Set([...positions2, ...positions3, ...positions4])].sort((a, b) => a - b)

      return {
        id: h.prediction_id,
        status: h.total_aciertos > 0 ? "WON" : "LOST",
        aciertos: allPositions,
        verified_at: h.verified_at,
      }
    })

    // Batch UPDATE: group by status, 2 queries max instead of N
    const wonIds = statusUpdates.filter(u => u.status === "WON").map(u => u.id)
    const lostIds = statusUpdates.filter(u => u.status === "LOST").map(u => u.id)
    const now = new Date().toISOString()

    if (wonIds.length > 0) {
      await supabase.from("user_predictions")
        .update({ status: "WON", verified_at: now })
        .in("id", wonIds)
    }
    if (lostIds.length > 0) {
      await supabase.from("user_predictions")
        .update({ status: "LOST", verified_at: now })
        .in("id", lostIds)
    }
  }

  const statsArray = Array.from(statsMap.values()).filter(s => s.user_id)
  if (statsArray.length > 0) {
    // Batch upsert user_stats instead of N individual RPC calls
    const statsRows = statsArray.map(stat => ({
      user_id: stat.user_id,
      total_predictions: stat.total_predictions,
      total_hits: stat.total_hits,
      current_streak: stat.current_streak,
      best_streak: stat.best_streak,
      last_verified: stat.last_verified,
    }))
    const { error: statsError } = await supabase
      .from("user_stats")
      .upsert(statsRows, { onConflict: "user_id" })
    if (statsError) {
      logger.error("[auto-verify] Batch user_stats upsert failed", { error: statsError.message })
    }
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
