import { createClient } from "@supabase/supabase-js"
import logger from "@/lib/logger"

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

interface ParsedNumeros {
  numeros_2: string[]
  numeros_3: string[]
  numeros_4: string[]
}

function parseNumeros(numeros: any): ParsedNumeros {
  let data = numeros
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
    try { data = JSON.parse(data[0]) } catch {}
  }
  if (Array.isArray(data)) {
    return { numeros_2: data.map((n: string) => String(n).padStart(2, "0")), numeros_3: [], numeros_4: [] }
  }
  return {
    numeros_2: (data?.["2"] || []).map((n: string) => String(n).padStart(2, "0")),
    numeros_3: (data?.["3"] || []).map((n: string) => String(n).padStart(3, "0")),
    numeros_4: (data?.["4"] || []).map((n: string) => String(n).padStart(4, "0")),
  }
}

function normalizeTurno(t: string): string {
  const base = t.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export async function autoVerifyPredictions(fecha: string, turno: string): Promise<any[]> {
  if (!SB_URL || !SK_KEY) return []

  const supabase = createClient(SB_URL, SK_KEY)
  const normalizedTurno = normalizeTurno(turno)

  // Fetch draw — use ilike for case-insensitive matching
  const { data: draws } = await supabase
    .from("draws")
    .select("numbers, turno")
    .eq("date", fecha)
    .ilike("turno", normalizedTurno)

  if (!draws?.length) return []
  const draw = draws[0]

  if (!draw.numbers?.length) return []

  const nums2 = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
  const nums3 = draw.numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
  const nums4 = draw.numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

  // Fetch ALL predictions for this date (any turno variant), then filter by normalized match
  const { data: allPredictions } = await supabase
    .from("user_predictions")
    .select("id, user_id, date, turno, numeros")
    .eq("date", fecha)

  if (!allPredictions?.length) return []

  // Filter predictions whose normalized turno matches
  const predictions = allPredictions.filter(p => normalizeTurno(p.turno || "") === normalizedTurno)

  if (!predictions.length) return []

  const predIds = predictions.map(p => p.id).filter(Boolean)
  const { data: existing } = await supabase
    .from("prediction_history")
    .select("prediction_id")
    .in("prediction_id", predIds)

  const verifiedSet = new Set((existing || []).map(e => e.prediction_id))

  const results: any[] = []

  for (const pred of predictions) {
    if (verifiedSet.has(pred.id)) continue

    const { numeros_2, numeros_3, numeros_4 } = parseNumeros(pred.numeros)

    const aciertos2 = numeros_2
      .filter((n: string) => nums2.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums2.indexOf(n) + 1 }))

    const aciertos3 = numeros_3
      .filter((n: string) => nums3.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums3.indexOf(n) + 1 }))

    const aciertos4 = numeros_4
      .filter((n: string) => nums4.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums4.indexOf(n) + 1 }))

    const totalAciertos = aciertos2.length + aciertos3.length + aciertos4.length

    const { error: insertError } = await supabase.from("prediction_history").insert({
      prediction_id: pred.id,
      user_id: pred.user_id,
      fecha: pred.date,
      turno: pred.turno,
      numeros_2,
      numeros_3,
      numeros_4,
      resultado_oficial: draw.numbers,
      aciertos_2: aciertos2,
      aciertos_3: aciertos3,
      aciertos_4: aciertos4,
      total_aciertos: totalAciertos,
      verified: true,
      verified_at: new Date().toISOString(),
    })

    if (insertError) {
      logger.error("[auto-verify] Error inserting prediction_history", { predId: pred.id, error: insertError.message })
      continue
    }

    if (pred.user_id) {
      const { data: existingStats } = await supabase
        .from("user_stats")
        .select("total_predictions, total_hits, best_streak, current_streak")
        .eq("user_id", pred.user_id)
        .single()

      const prev = existingStats || { total_predictions: 0, total_hits: 0, best_streak: 0, current_streak: 0 }
      const newStreak = totalAciertos > 0 ? prev.current_streak + 1 : 0

      const { error: statsError } = await supabase.from("user_stats").upsert({
        user_id: pred.user_id,
        total_predictions: prev.total_predictions + 1,
        total_hits: prev.total_hits + totalAciertos,
        current_streak: newStreak,
        best_streak: Math.max(prev.best_streak, newStreak),
        last_verified: new Date().toISOString(),
      }, { onConflict: "user_id" })

      if (statsError) {
        logger.error("[auto-verify] Error upserting user_stats", { userId: pred.user_id, error: statsError.message })
      }
    }

    results.push({
      id: pred.id,
      fecha,
      turno: pred.turno,
      aciertos_2: aciertos2,
      aciertos_3: aciertos3,
      aciertos_4: aciertos4,
      total_aciertos: totalAciertos,
      resultado_oficial: draw.numbers,
    })
  }

  if (results.length > 0) {
    logger.info("[auto-verify] Verified predictions", { fecha, turno: normalizedTurno, count: results.length })
  }

  return results
}

export async function getVerificationStats(userId?: string, days: number = 30) {
  if (!SB_URL || !SK_KEY) return null

  const supabase = createClient(SB_URL, SK_KEY)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  let query = supabase
    .from("prediction_history")
    .select("*")
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
