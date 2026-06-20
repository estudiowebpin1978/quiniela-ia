/**
 * Python ML Model Loader
 * Loads LightGBM, XGBoost, and ensemble predictions from Supabase.
 * Fallback: filesystem (local dev only).
 */

interface PythonBoostResult {
  [num: number]: number
}

let pyCache: Record<string, PythonBoostResult> = {}
let pyCacheLoaded = false

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

/**
 * Load Python model scores from Supabase.
 * Looks for turno entries in ml_models that match lgbm_*, xgboost_*, ensemble_* patterns.
 */
export async function loadPythonModelsFromSupabase(): Promise<void> {
  if (pyCacheLoaded) return

  const SB = SB_URL()
  const SK = SB_KEY()
  if (!SB || !SK) return

  try {
    const res = await fetch(
      `${SB}/rest/v1/ml_models?select=turno,modelos&order=updated_at.desc&limit=50`,
      { headers: { apikey: SK, Authorization: `Bearer ${SK}` } }
    )
    if (!res.ok) return

    const rows = await res.json()
    for (const row of rows) {
      if (row.modelos) {
        const modelos = JSON.parse(row.modelos)
        for (const m of modelos) {
          if ((m.tipo === "lgbm" || m.tipo === "xgboost" || m.tipo === "ensemble") && m.modelo?.scores_por_numero) {
            const key = `${m.tipo}_${row.turno}`
            const scores: PythonBoostResult = {}
            for (const [k, v] of Object.entries(m.modelo.scores_por_numero)) {
              const num = parseInt(k, 10)
              if (!isNaN(num)) scores[num] = (v as number) / 8
            }
            pyCache[key] = scores
          }
        }
      }
    }
    pyCacheLoaded = true
  } catch {}
}

/**
 * Get ensemble boost scores (LGBM + XGBoost average).
 */
export function obtenerBoostEnsemble(turno: string): PythonBoostResult | null {
  // Try ensemble first
  const ensemble = pyCache[`ensemble_${turno}`]
  if (ensemble) return ensemble

  // Fallback: average LGBM + XGBoost
  const lgbm = pyCache[`lgbm_${turno}`]
  const xgb = pyCache[`xgboost_${turno}`]
  if (lgbm && xgb) {
    const merged: PythonBoostResult = {}
    for (let n = 0; n < 100; n++) {
      merged[n] = ((lgbm[n] || 0) + (xgb[n] || 0)) / 2
    }
    return merged
  }

  return lgbm || xgb || null
}

/**
 * Get XGBoost-only boost scores.
 */
export function obtenerBoostXGBoost(turno: string): PythonBoostResult | null {
  return pyCache[`xgboost_${turno}`] || null
}

/**
 * Get LightGBM-only boost scores.
 */
export function obtenerBoostLightGBM(turno: string): PythonBoostResult | null {
  return pyCache[`lgbm_${turno}`] || null
}
