/**
 * Auto-verification system.
 * After each scrape, automatically verifies pending predictions against actual results.
 * Stores results in Supabase prediction_history table.
 */

import { createClient } from "@supabase/supabase-js"

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

interface PredictionToVerify {
  id: string
  user_id: string
  fecha: string
  turno: string
  numeros_2: string[]
  numeros_3?: string[]
  numeros_4?: string[]
  verified?: boolean
}

interface VerificationResult {
  id: string
  fecha: string
  turno: string
  aciertos_2: { numero: string; puesto: number }[]
  aciertos_3: { numero: string; puesto: number }[]
  aciertos_4: { numero: string; puesto: number }[]
  total_aciertos: number
  resultado_oficial: number[]
}

export async function autoVerifyPredictions(fecha: string, turno: string): Promise<VerificationResult[]> {
  if (!SB_URL || !SK_KEY) return []

  const supabase = createClient(SB_URL, SK_KEY)

  // 1. Get actual draw numbers
  const { data: draw } = await supabase
    .from("draws")
    .select("numbers")
    .eq("date", fecha)
    .eq("turno", turno)
    .single()

  if (!draw?.numbers?.length) return []

  const nums2 = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
  const nums3 = draw.numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
  const nums4 = draw.numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

  // 2. Get unverified predictions for this turno+fecha
  const { data: predictions } = await supabase
    .from("prediction_history")
    .select("*")
    .eq("fecha", fecha)
    .eq("turno", turno)
    .eq("verified", false)

  if (!predictions?.length) return []

  const results: VerificationResult[] = []

  for (const pred of predictions) {
    const aciertos2 = (pred.numeros_2 || [])
      .filter((n: string) => nums2.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums2.indexOf(n) + 1 }))

    const aciertos3 = (pred.numeros_3 || [])
      .filter((n: string) => nums3.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums3.indexOf(n) + 1 }))

    const aciertos4 = (pred.numeros_4 || [])
      .filter((n: string) => nums4.includes(n))
      .map((n: string) => ({ numero: n, puesto: nums4.indexOf(n) + 1 }))

    const totalAciertos = aciertos2.length + aciertos3.length + aciertos4.length

    // 3. Update prediction with results
    await supabase
      .from("prediction_history")
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        aciertos_2: aciertos2,
        aciertos_3: aciertos3,
        aciertos_4: aciertos4,
        total_aciertos: totalAciertos,
        resultado_oficial: draw.numbers,
      })
      .eq("id", pred.id)

    // 4. Update user stats
    if (pred.user_id) {
      const { data: existing } = await supabase
        .from("user_stats")
        .select("total_predictions, total_hits, best_streak, current_streak")
        .eq("user_id", pred.user_id)
        .single()

      const prev = existing || { total_predictions: 0, total_hits: 0, best_streak: 0, current_streak: 0 }
      const newStreak = totalAciertos > 0 ? prev.current_streak + 1 : 0

      await supabase.from("user_stats").upsert({
        user_id: pred.user_id,
        total_predictions: prev.total_predictions + 1,
        total_hits: prev.total_hits + totalAciertos,
        current_streak: newStreak,
        best_streak: Math.max(prev.best_streak, newStreak),
        last_verified: new Date().toISOString(),
      }, { onConflict: "user_id" })
    }

    results.push({
      id: pred.id,
      fecha,
      turno,
      aciertos_2: aciertos2,
      aciertos_3: aciertos3,
      aciertos_4: aciertos4,
      total_aciertos: totalAciertos,
      resultado_oficial: draw.numbers,
    })
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
