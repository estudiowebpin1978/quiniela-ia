import { getSupabaseAdmin } from "@/lib/supabase-client"

interface EngineWeights {
  V6: number
  V7: number
  ML: number
}

const FALLBACK_WEIGHTS: EngineWeights = { V6: 0.33, V7: 0.33, ML: 0.34 }

export async function loadEngineWeights(turno: string): Promise<EngineWeights> {
  const supabase = getSupabaseAdmin()
  try {
    const { data, error } = await supabase
      .from("engine_performance")
      .select("engine_name, win_rate_last_10")
      .eq("turno", turno)

    if (error || !data || data.length === 0) return FALLBACK_WEIGHTS

    const rates: Record<string, number> = {}
    let total = 0
    for (const row of data) {
      const rate = Number(row.win_rate_last_10) || 0.3333
      rates[row.engine_name] = rate
      total += rate
    }

    if (total <= 0) return FALLBACK_WEIGHTS

    return {
      V6: (rates.V6 || 0.3333) / total,
      V7: (rates.V7 || 0.3333) / total,
      ML: (rates.ML || 0.3333) / total,
    }
  } catch {
    return FALLBACK_WEIGHTS
  }
}

export async function logEnginePredictions(
  drawId: string,
  turno: string,
  predsV6: number[],
  predsV7: number[],
  predsML: number[],
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("engine_predictions_log").upsert(
    [
      { draw_id: drawId, turno, engine_name: "V6", predicted_numbers: predsV6 },
      { draw_id: drawId, turno, engine_name: "V7", predicted_numbers: predsV7 },
      { draw_id: drawId, turno, engine_name: "ML", predicted_numbers: predsML },
    ],
    { onConflict: "draw_id,engine_name" },
  )
  if (error) {
    console.error("[meta-ensemble] logEnginePredictions failed:", error.message)
  }
}

export async function updateEnginePerformance(): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.rpc("update_engine_performance" as never)
  if (error) {
    console.error("[meta-ensemble] updateEnginePerformance failed:", error.message)
  }
}
