/**
 * Auto-training module for ML models.
 * Trains Markov, Random Forest, and Neural Net from historical data.
 * Persists to Supabase ml_models table and caches in globalThis.
 */

import { setModelos, getModelos } from "./cache"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"]

interface TrainResult {
  turno: string
  modelos: any[]
  tiempoMs: number
}

/**
 * Fetch historical draws for a turno from Supabase.
 */
async function fetchDraws(turno: string, limit = 5000): Promise<any[]> {
  const SB = SB_URL()
  const SK = SB_KEY()
  if (!SB || !SK) return []

  try {
    const res = await fetch(
      `${SB}/rest/v1/draws?select=date,turno,numbers&turno=ilike.*${turno}*&order=date.desc&limit=${limit}`,
      { headers: { apikey: SK, Authorization: `Bearer ${SK}` } }
    )
    if (!res.ok) return []
    const rows = await res.json()
    return rows
      .filter((r: any) => Array.isArray(r.numbers) && r.numbers.length >= 20)
      .map((r: any) => ({
        fecha: r.date,
        turno: r.turno,
        numbers: r.numbers.map((n: any) => Number(n)).filter((n: number) => !isNaN(n))
      }))
  } catch {
    return []
  }
}

/**
 * Train all ML models for a single turno.
 */
async function trainTurno(turno: string): Promise<TrainResult> {
  const start = Date.now()

  const sorteos = await fetchDraws(turno)
  if (sorteos.length < 50) {
    return { turno, modelos: [], tiempoMs: 0 }
  }

  try {
    const { entrenarModelos } = await import("./trainer")
    const resultado = await entrenarModelos(sorteos, {
      incluirRF: true,
      incluirMarkov: true,
      incluirNN: true,
    })

    const modelos = resultado.modelos.map(m => ({
      tipo: m.tipo,
      nombre: m.nombre,
      modelo: m.modelo,
      precision: m.precision,
      fechaEntrenamiento: m.fechaEntrenamiento,
      metricas: m.metricas,
    }))

    // Cache in globalThis
    setModelos(turno, modelos)

    return { turno, modelos, tiempoMs: Date.now() - start }
  } catch {
    return { turno, modelos: [], tiempoMs: Date.now() - start }
  }
}

/**
 * Persist trained models to Supabase ml_models table.
 * Creates the table if it doesn't exist (via upsert pattern).
 */
async function persistToSupabase(turno: string, modelos: any[]): Promise<boolean> {
  const SB = SB_URL()
  const SK = SB_KEY()
  if (!SB || !SK || !modelos.length) return false

  try {
    // Try to upsert - if table doesn't exist, this will fail gracefully
    const res = await fetch(`${SB}/rest/v1/ml_models`, {
      method: "POST",
      headers: {
        apikey: SK,
        Authorization: `Bearer ${SK}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        turno,
        modelos: JSON.stringify(modelos),
        updated_at: new Date().toISOString(),
      }),
    })

    if (!res.ok) {
      // Table might not exist yet - try creating it via SQL
      console.log(`[AutoML] ml_models table might not exist, models cached in memory for ${turno}`)
      return false
    }

    console.log(`[AutoML] Persisted ${modelos.length} models for ${turno} to Supabase`)
    return true
  } catch {
    return false
  }
}

/**
 * Load models from Supabase ml_models table.
 */
export async function loadFromSupabase(turno: string): Promise<any[] | null> {
  const SB = SB_URL()
  const SK = SB_KEY()
  if (!SB || !SK) return null

  try {
    const res = await fetch(
      `${SB}/rest/v1/ml_models?turno=eq.${turno}&select=modelos,updated_at&order=updated_at.desc&limit=1`,
      { headers: { apikey: SK, Authorization: `Bearer ${SK}` } }
    )
    if (!res.ok) return null

    const rows = await res.json()
    if (!rows?.length) return null

    const modelos = JSON.parse(rows[0].modelos)
    // Re-cache in globalThis for fast access
    setModelos(turno, modelos)

    console.log(`[AutoML] Loaded ${modelos.length} models for ${turno} from Supabase`)
    return modelos
  } catch {
    return null
  }
}

/**
 * Auto-train all turnos. Called by cron or lazily on first prediction request.
 */
export async function autoTrainAll(): Promise<TrainResult[]> {
  const results: TrainResult[] = []

  for (const turno of TURNOS) {
    const result = await trainTurno(turno)
    results.push(result)

    if (result.modelos.length > 0) {
      await persistToSupabase(turno, result.modelos)
    }
  }

  return results
}

/**
 * Auto-train a single turno. Used for lazy initialization on prediction request.
 */
export async function autoTrainSingle(turno: string): Promise<any[] | null> {
  // Check cache first
  const cached = getModelos(turno)
  if (cached && cached.length > 0) return cached

  // Check Supabase
  const fromDB = await loadFromSupabase(turno)
  if (fromDB && fromDB.length > 0) return fromDB

  // Train from scratch
  const result = await trainTurno(turno)
  if (result.modelos.length > 0) {
    await persistToSupabase(turno, result.modelos)
    return result.modelos
  }

  return null
}
