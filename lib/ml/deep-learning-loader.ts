/**
 * Deep Learning Model Loader
 * Loads LSTM, Transformer, and BNN predictions from Supabase.
 * Fallback: filesystem (local dev only).
 */

interface DeepLearningResult {
  scores: Record<string, number>
  top10: number[]
  uncertainty?: Record<string, number>
}

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

let dlCache: Record<string, DeepLearningResult> = {}
let dlCacheLoaded = false

export async function loadDeepLearningFromSupabase(): Promise<void> {
  if (dlCacheLoaded) return

  const SB = SB_URL()
  const SK = SB_KEY()
  if (!SB || !SK) return

  try {
    const res = await fetch(
      `${SB}/rest/v1/ml_models?turno=like.dl_*&select=turno,modelos&order=updated_at.desc`,
      { headers: { apikey: SK, Authorization: `Bearer ${SK}` } }
    )
    if (!res.ok) return

    const rows = await res.json()
    for (const row of rows) {
      if (row.modelos) {
        const modelos = JSON.parse(row.modelos)
        const dlModel = modelos.find((m: any) => m.tipo === "deep-learning")
        if (dlModel?.modelo) {
          const turno = row.turno.replace("dl_", "")
          const ensemble = dlModel.modelo.ensemble || {}
          const bnn = dlModel.modelo.bnn || {}
          dlCache[turno] = {
            scores: ensemble.scores || {},
            top10: ensemble.top10 || [],
            uncertainty: bnn.uncertainty || {}
          }
        }
      }
    }
    dlCacheLoaded = true
  } catch {}
}

/**
 * Get deep learning boost for a specific number.
 * Returns a score [0, 1] based on LSTM + Transformer + BNN ensemble.
 */
export function getDeepLearningBoost(turno: string, num: number): number {
  const dl = dlCache[turno]
  if (!dl) return 0

  const key = String(num)
  return dl.scores[key] || 0
}

/**
 * Get uncertainty estimate for a number (from BNN).
 */
export function getPredictionUncertainty(turno: string, num: number): number {
  const dl = dlCache[turno]
  if (!dl || !dl.uncertainty) return 0.5

  const key = String(num)
  return dl.uncertainty[key] || 0.5
}
