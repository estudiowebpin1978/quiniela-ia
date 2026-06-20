/**
 * Deep Learning Model Loader
 * Loads LSTM, Transformer, and BNN predictions.
 * On Vercel: loads from Supabase ml_dl_models table.
 * Fallback: loads from filesystem (local dev).
 */

import * as fs from "fs"
import * as path from "path"

interface DeepLearningResult {
  scores: Record<string, number>
  top10: number[]
  uncertainty?: Record<string, number>
}

const EXPORT_DIR = path.join(process.cwd(), "modelos_exportados")

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

/**
 * Load deep learning ensemble predictions for a turno.
 * Tries Supabase first, falls back to filesystem.
 */
export function loadDeepLearning(turno: string): DeepLearningResult | null {
  // Try filesystem first (works in local dev)
  try {
    const filePath = path.join(EXPORT_DIR, `deep_learning_${turno}.json`)
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8")
      const data = JSON.parse(raw)
      if (data.ensemble) {
        return {
          scores: data.ensemble.scores || {},
          top10: data.ensemble.top10 || [],
          uncertainty: data.bnn?.uncertainty || {}
        }
      }
    }
  } catch {}

  return null
}

/**
 * Async load from Supabase (for Vercel serverless).
 * Call this once on startup and cache the result.
 */
let dlCache: Record<string, DeepLearningResult> = {}
let dlCacheLoaded = false

export async function loadDeepLearningFromSupabase(): Promise<void> {
  if (dlCacheLoaded) return

  const SB = SB_URL()
  const SK = SB_KEY()
  if (!SB || !SK) return

  try {
    const res = await fetch(
      `${SB}/rest/v1/ml_dl_models?select=turno,data&order=updated_at.desc`,
      { headers: { apikey: SK, Authorization: `Bearer ${SK}` } }
    )
    if (!res.ok) return

    const rows = await res.json()
    for (const row of rows) {
      if (row.data) {
        dlCache[row.turno] = JSON.parse(row.data)
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
  const dl = dlCache[turno] || loadDeepLearning(turno)
  if (!dl) return 0

  const key = String(num)
  return dl.scores[key] || 0
}

/**
 * Get uncertainty estimate for a number (from BNN).
 * Higher uncertainty = less confident in the prediction.
 */
export function getPredictionUncertainty(turno: string, num: number): number {
  const dl = dlCache[turno] || loadDeepLearning(turno)
  if (!dl || !dl.uncertainty) return 0.5

  const key = String(num)
  return dl.uncertainty[key] || 0.5
}
