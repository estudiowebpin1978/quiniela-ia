/**
 * Auto-training module for ML models.
 * Trains Markov, Random Forest, and Neural Net from historical data.
 * Persists to Supabase ml_models table and caches in globalThis.
 * Supports AI-enhanced predictions via Ollama (local) or Groq/Gemini (cloud).
 *
 * Architecture:
 * - Heavy compute (training) is separated from API calls (AI enhancement)
 * - Heavy compute can be routed to Ollama for local inference
 * - API calls are optional text formatting/enhancement layer
 */

import { setModelos, getModelos } from "./cache"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const OLLAMA_HOST = () => (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/"/g, "").trim()
const OLLAMA_MODEL = () => (process.env.OLLAMA_MODEL || "llama3.2:3b").replace(/"/g, "").trim()
const GROQ_API_KEY = () => (process.env.GROQ_API_KEY || "").replace(/"/g, "").trim()
const GEMINI_API_KEY = () => (process.env.GEMINI_API_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"]

interface TrainResult {
  turno: string
  modelos: any[]
  tiempoMs: number
  proveedorIA?: string
}

// AI Provider abstraction
interface AIProvider {
  name: string
  generatePrediction(input: string, context?: string): Promise<any>
}

class OllamaAI implements AIProvider {
  name = "ollama"
  async generatePrediction(input: string, context?: string): Promise<any> {
    const res = await fetch(`${OLLAMA_HOST()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL(),
        messages: [
          { role: "system", content: "Eres un experto en análisis estadístico de quinielas. Proporciona predicciones basadas en datos." },
          { role: "user", content: `${context ? `Contexto: ${context}\n\n` : ""}Analiza los datos históricos y predice el próximo sorteo: ${input}` }
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 1024 }
      })
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json()
    return { choices: [{ message: { content: data?.message?.content } }] }
  }
}

class GroqAI implements AIProvider {
  name = "groq"
  async generatePrediction(input: string, context?: string): Promise<any> {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    return res.json()
  }
}

class GeminiAI implements AIProvider {
  name = "gemini"
  async generatePrediction(input: string, context?: string): Promise<any> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Eres un experto en análisis estadístico de quinielas. Proporciona predicciones basadas en datos históricos.
            Contexto: ${context || ""}
            Datos para análisis: ${input}
            Proporciona análisis estadístico detallado y predicción del próximo sorteo.`
          }]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
      })
    })
    return res.json()
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
 * HEAVY COMPUTE ONLY: Train traditional ML models (Markov, RF, Neural).
 * This function is separated from API calls for Ollama routing.
 * Can be offloaded to local inference for cost optimization.
 */
export async function trainTurnoHeavyCompute(turno: string): Promise<{ modelos: any[]; tiempoMs: number }> {
  const start = Date.now()

  const { entrenarModelos } = await import("./trainer")
  const sorteos = await fetchDraws(turno)
  
  if (sorteos.length < 50) {
    return { modelos: [], tiempoMs: Date.now() - start }
  }

  // Pure ML training - no API calls
  const resultado = await entrenarModelos(sorteos, {
    incluirRF: true,
    incluirMarkov: true,
    incluirNN: true,
  })

  return { modelos: resultado.modelos, tiempoMs: Date.now() - start }
}

/**
 * AI ENHANCEMENT ONLY: Generate AI predictions via Ollama (local) or cloud APIs.
 * This is the optional text formatting/enhancement layer.
 * Can be called independently after heavy compute.
 */
export async function enhanceWithAI(
  sorteos: any[],
  turno: string,
  aiProviders: string[]
): Promise<{ aiPredictions: any; proveedorIA: string }> {
  let aiPredictions: any = null
  let proveedorIA = ""

  if (!aiProviders || aiProviders.length === 0) {
    return { aiPredictions: null, proveedorIA: "" }
  }

  const providerMap: Record<string, AIProvider> = {
    ollama: new OllamaAI(),
    groq: new GroqAI(),
    gemini: new GeminiAI(),
  }

  try {
    const activeProviders = aiProviders
      .filter(name => providerMap[name])
      .map(name => providerMap[name])

    if (activeProviders.length === 0) {
      return { aiPredictions: null, proveedorIA: "" }
    }

    const inputData = JSON.stringify(sorteos.slice(-50))
    const context = `Análisis de los últimos ${sorteos.length} sorteos de quiniela para turno ${turno}`

    const aiPromises = activeProviders.map(p => p.generatePrediction(inputData, context))
    const aiResults = await Promise.allSettled(aiPromises)

    const successfulResults = aiResults
      .filter(result => result.status === "fulfilled")
      .map(result => result.value)

    const successfulNames = activeProviders
      .filter((_, idx) => aiResults[idx].status === "fulfilled")
      .map(p => p.name)

    if (successfulResults.length > 0) {
      aiPredictions = {
        predictions: successfulResults,
        providers: successfulNames
      }
      proveedorIA = successfulNames.join("+")
    }
  } catch (e) {
    console.warn(`[AutoML AI] Error generating AI predictions:`, e)
  }

  return { aiPredictions, proveedorIA }
}

/**
 * Enhanced ML training with AI-powered features.
 * Combines heavy compute with optional AI enhancement.
 */
async function trainTurnoConIA(
  turno: string, 
  aiProviders?: string[]
): Promise<TrainResult> {
  const start = Date.now()

  // Step 1: Heavy compute (can be routed to Ollama)
  const { modelos, tiempoMs: computeTimeMs } = await trainTurnoHeavyCompute(turno)
  
  if (modelos.length === 0) {
    return { turno, modelos: [], tiempoMs: Date.now() - start }
  }

  // Step 2: Optional AI enhancement (API calls)
  let aiPredictions: any = null
  let proveedorIA = ""

  if (aiProviders && aiProviders.length > 0) {
    const sorteos = await fetchDraws(turno)
    const aiResult = await enhanceWithAI(sorteos, turno, aiProviders)
    aiPredictions = aiResult.aiPredictions
    proveedorIA = aiResult.proveedorIA
  }

  // Enhance traditional models with AI predictions
  const enhancedModelos = modelos.map(modelo => ({
    ...modelo,
    ai_enhanced: !!aiPredictions,
    ai_predictions: aiPredictions,
    ai_providers: proveedorIA
  }))

  // Cache in Supabase-backed store
  await setModelos(turno, enhancedModelos)

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
    await setModelos(turno, modelos)

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
  const proveedoresIA = conectarIA ? ["ollama", "groq", "gemini"] : []

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
  const cached = await getModelos(turno)
  if (cached && cached.length > 0) return cached

  // Check Supabase
  const fromDB = await loadFromSupabase(turno)
  if (fromDB && fromDB.length > 0) {
    console.log(`[AutoML] Loaded cached models with AI for ${turno} from Supabase`)
    return fromDB
  }

  // Train from scratch with optional AI enhancement
  const aiProviders = conectarIA ? ["ollama", "groq", "gemini"] : []
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
