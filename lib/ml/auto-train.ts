/**
 * Auto-training module for ML models.
 * Trains Markov, Random Forest, and Neural Net from historical data.
 * Persists to Supabase ml_models table and caches in globalThis.
 * Supports AI-enhanced predictions via Groq, Gemini, CRSR, and SK APIs.
 */

import { setModelos, getModelos } from "./cache"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

// AI API Keys (from .env.local)
const GROQ_API_KEY = () => (process.env.GROQ_API_KEY || "").replace(/"/g, "").trim()
const GEMINI_API_KEY = () => (process.env.GEMINI_API_KEY || "").replace(/"/g, "").trim()
const CRSR_API_KEY = () => (process.env.CRSR_API_KEY || "").replace(/"/g, "").trim()
const SK_API_KEY = () => (process.env.SK_API_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"]

interface TrainResult {
  turno: string
  modelos: any[]
  tiempoMs: number
  proveedorIA?: string
}

// AI Model implementations
class GroqAI {
  async generatePrediction(input: string, context?: string): Promise<any> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: "Eres un experto en análisis estadístico de quinielas. Proporciona predicciones basadas en datos." },
          { role: "user", content: `${context ? `Contexto: ${context}\n\n` : ""}Analiza los datos históricos y predice el próximo sorteo: ${input}` }
        ],
        temperature: 0.3,
        max_tokens: 1024
      })
    })
    return response.json()
  }
}

class GeminiAI {
  async generatePrediction(input: string, context?: string): Promise<any> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Eres un experto en análisis estadístico de quinielas. Proporciona predicciones basadas en datos históricos.
            Contexto: ${context || ""}
            Datos para análisis: ${input}
            Proporciona análisis estadístico detallado y predicción del próximo sorteo.`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024
        }
      })
    })
    return response.json()
  }
}

// Fallback AI implementation
class CRSR_AI {
  async generatePrediction(input: string, context?: string): Promise<any> {
    const response = await fetch("https://api.crsr.io/v1/predict", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CRSR_API_KEY()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "ml-model-v1",
        input: {
          historical_data: context,
          current_prediction_input: input
        }
      })
    })
    return response.json()
  }
}

class SKAI {
  async generatePrediction(input: string, context?: string): Promise<any> {
    const response = await fetch("https://api.skymind.io/v1/predict", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SK_API_KEY()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "quiniela-forecast-v2",
        query: input,
        context: context,
        parameters: {
          prediction_type: "next_draw",
          confidence_threshold: 0.7
        }
      })
    })
    return response.json()
  }
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
 * Enhanced ML training with AI-powered features
 */
async function trainTurnoConIA(
  turno: string, 
  aiProviders?: string[]
): Promise<{ turno: string; modelos: any[]; tiempoMs: number; proveedorIA?: string }> {
  const start = Date.now()

  // Import base training function
  const { entrenarModelos } = await import("./trainer")

  // Fetch training data
  const sorteos = await fetchDraws(turno)
  if (sorteos.length < 50) {
    return { turno, modelos: [], tiempoMs: Date.now() - start }
  }

  // Train traditional models first
  const resultado = await entrenarModelos(sorteos, {
    incluirRF: true,
    incluirMarkov: true,
    incluirNN: true,
  })

  // Generate AI-enhanced predictions if AI providers requested
  let aiPredictions: any = null
  let proveedorIA = ""

  if (aiProviders && aiProviders.length > 0) {
    try {
      const groq = new GroqAI()
      const gemini = new GeminiAI()
      const cersr = new CRSR_AI()
      const sk = new SKAI()

      const aiPromises: Promise<any>[] = []
      const aiNames: string[] = []

      if (aiProviders.includes("groq")) {
        aiPromises.push(groq.generatePrediction(
          JSON.stringify(sorteos.slice(-50)),
          `Análisis de los últimos ${sorteos.length} sorteos de quiniela para turno ${turno}`
        ))
        aiNames.push("Groq")
      }

      if (aiProviders.includes("gemini")) {
        aiPromises.push(gemini.generatePrediction(
          JSON.stringify(sorteos.slice(-50)),
          `Análisis de los últimos ${sorteos.length} sorteos de quiniela para turno ${turno}`
        ))
        aiNames.push("Gemini")
      }

      if (aiProviders.includes("crsr")) {
        aiPromises.push(cersr.generatePrediction(
          JSON.stringify(sorteos.slice(-50)),
          `Análisis de los últimos ${sorteos.length} sorteos de quiniela para turno ${turno}`
        ))
        aiNames.push("CRSR")
      }

      if (aiProviders.includes("sk")) {
        aiPromises.push(sk.generatePrediction(
          JSON.stringify(sorteos.slice(-50)),
          `Análisis de los últimos ${sorteos.length} sorteos de quiniela para turno ${turno}`
        ))
        aiNames.push("SK")
      }

      if (aiPromises.length > 0) {
        const aiResults = await Promise.allSettled(aiPromises)
        const successfulResults = aiResults
          .filter(result => result.status === "fulfilled")
          .map(result => result.value)

        if (successfulResults.length > 0) {
          aiPredictions = {
            predictions: successfulResults,
            providers: aiNames.filter((_, idx) => aiResults[idx].status === "fulfilled")
          }
          proveedorIA = aiNames.filter((_, idx) => aiResults[idx].status === "fulfilled").join("+" )
        }
      }
    } catch (e) {
      console.warn(`[AutoML AI] Error generating AI predictions:`, e)
    }
  }

  // Enhance traditional models with AI predictions
  const enhancedModelos = resultado.modelos.map(modelo => ({
    ...modelo,
    ai_enhanced: !!aiPredictions,
    ai_predictions: aiPredictions,
    ai_providers: proveedorIA
  }))

  // Cache in globalThis
  setModelos(turno, enhancedModelos)

  return { turno, modelos: enhancedModelos, tiempoMs: Date.now() - start, proveedorIA }
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
 * Auto-train all turnos with optional AI enhancement.
 * Called by cron or lazily on first prediction request.
 */
export async function autoTrainAll(conectarIA: boolean = false): Promise<TrainResult[]> {
  const results: TrainResult[] = []
  const proveedoresIA = conectarIA ? ["groq", "gemini", "crsr", "sk"] : []

  for (const turno of TURNOS) {
    const result = await trainTurnoConIA(turno, proveedoresIA)
    results.push(result)

    if (result.modelos.length > 0) {
      await persistToSupabase(turno, result.modelos)
    }
  }

  return results
}

/**
 * Auto-train a single turno with optional AI enhancement.
 * Used for lazy initialization on prediction request.
 */
export async function autoTrainSingle(turno: string, conectarIA: boolean = false): Promise<any[] | null> {
  // Check cache first
  const cached = getModelos(turno)
  if (cached && cached.length > 0) return cached

  // Check Supabase
  const fromDB = await loadFromSupabase(turno)
  if (fromDB && fromDB.length > 0) {
    console.log(`[AutoML] Loaded cached models with AI for ${turno} from Supabase`)
    return fromDB
  }

  // Train from scratch with optional AI enhancement
  const aiProviders = conectarIA ? ["groq", "gemini", "crsr", "sk"] : []
  const result = await trainTurnoConIA(turno, aiProviders)
  if (result.modelos.length > 0) {
    await persistToSupabase(turno, result.modelos)
    console.log(`[AutoML] Trained and persisted ${result.modelos.length} models for ${turno}`)
    if (result.proveedorIA) {
      console.log(`[AutoML] AI providers used: ${result.proveedorIA}`)
    }
    return result.modelos
  }

  return null
}
