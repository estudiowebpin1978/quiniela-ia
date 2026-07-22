/**
 * Python ML Model Loader
 * Loads LightGBM, XGBoost, and ensemble predictions from Supabase.
 * Also fetches live predictions from FastAPI ML Backend when available.
 */

interface PythonBoostResult {
  [num: number]: number
}

let pyCache: Record<string, PythonBoostResult> = {}
let pyCacheLoaded = false

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()
const ML_API_URL = () => (process.env.ML_API_URL || "").replace(/"/g, "").trim()

/**
 * Try to fetch live predictions from FastAPI ML Backend.
 * Falls back to Supabase cache if unavailable.
 */
export async function fetchFromMLBackend(turno: string): Promise<PythonBoostResult | null> {
  const url = ML_API_URL()
  if (!url) return null

  try {
    const res = await fetch(`${url}/api/predict/${turno}?top=100`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const data = await res.json()
    if (!data.ok || !data.scores) return null

    const scores: PythonBoostResult = {}
    for (const [k, v] of Object.entries(data.scores)) {
      const num = parseInt(k, 10)
      if (!isNaN(num)) scores[num] = (v as number) / 8
    }
    return Object.keys(scores).length > 0 ? scores : null
  } catch {
    return null
  }
}

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
 * Tries ML Backend first, then Supabase cache.
 */
export async function obtenerBoostEnsemble(turno: string): Promise<PythonBoostResult | null> {
  // Try ML Backend first (live prediction)
  const liveScores = await fetchFromMLBackend(turno)
  if (liveScores) return liveScores

  // Fallback: Supabase cache
  const ensemble = pyCache[`ensemble_${turno}`]
  if (ensemble) return ensemble

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
