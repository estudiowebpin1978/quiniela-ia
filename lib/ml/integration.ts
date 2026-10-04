/**
 * ML Integration — Load trained models and generate predictions for production path
 *
 * Loads RF, Neural Net, and Markov models from ml_models table,
 * generates predictions, and returns scores for blending with V6/V7.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import { deserializarRandomForest, predecirRandomForest } from "./random-forest"
import { predecirRedNeuronal } from "./neural"
import { predecirSiguienteMarkov } from "./markov"
import { prepararFeatures, prepararPrediccion } from "./trainer"
import logger from "@/lib/logger"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MLPrediction {
  scores: Map<number, number>  // number -> score [0, 1]
  modelContributions: {
    randomForest: number
    neuralNet: number
    markov: number
  }
  available: boolean
}

interface StoredModel {
  tipo: string
  nombre: string
  modelo: unknown
}

// ─── Turnos canónicos (Mayúscula inicial) ─────────────────────────────────────
// La tabla ml_models guarda turnos en formato canónico ("Matutina"); si el
// caller pasara minúsculas, PostgREST (.eq es case-sensitive) no encontraría
// el modelo y ML quedaría "no disponible" sin motivo real.
const TURNOS_CANONICOS: Record<string, string> = {
  previa: "Previa",
  primera: "Primera",
  matutina: "Matutina",
  vespertina: "Vespertina",
  nocturna: "Nocturna",
  poceada: "Poceada",
}

function turnoCanonico(turno: string): string {
  return TURNOS_CANONICOS[turno.trim().toLowerCase()] ?? turno
}

// ─── Load and Predict ───────────────────────────────────────────────────────

export async function getMLPredictions(
  turno: string,
  recentDraws: Array<{ fecha: string; turno: string; numbers: number[] }>,
): Promise<MLPrediction> {
  const empty: MLPrediction = {
    scores: new Map(),
    modelContributions: { randomForest: 0, neuralNet: 0, markov: 0 },
    available: false,
  }

  if (recentDraws.length < 10) return empty

  try {
    const supabase = getSupabaseAdmin()

    // Load trained models from DB
    const { data: modelData } = await supabase
      .from("ml_models")
      .select("modelos")
      .eq("turno", turnoCanonico(turno))
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()

    if (!modelData?.modelos) {
      return empty
    }

    const modelos: StoredModel[] = Array.isArray(modelData.modelos)
      ? modelData.modelos
      : JSON.parse(modelData.modelos as string)

    // Prepare features for prediction
    const featureVector = prepararPrediccion(recentDraws)
    const sequences = recentDraws.map(d => d.numbers.map(n => n % 100))

    // Accumulate scores from all models
    const scores = new Map<number, number>()
    const contributions = { randomForest: 0, neuralNet: 0, markov: 0 }
    let modelCount = 0

    for (const stored of modelos) {
      try {
        if (stored.tipo === "random-forest" && stored.modelo) {
          const rf = deserializarRandomForest(JSON.stringify(stored.modelo))
          if (rf.entrenado && rf.arbres.length > 0) {
            // Use actual RF inference: runs all trees, takes majority vote
            const rfPred = predecirRandomForest(rf, featureVector)
            // rfPred.probabilidades is a 100-dim array with vote proportions
            for (let i = 0; i < 100; i++) {
              const existing = scores.get(i) || 0
              scores.set(i, existing + rfPred.probabilidades[i] * 0.4)
            }
            contributions.randomForest += 0.4
            modelCount++
          }
        }

        if (stored.tipo === "neural" && stored.modelo) {
          const nn = stored.modelo as { capas?: unknown[]; tasaAprendizaje?: number }
          if (nn.capas && nn.capas.length > 0) {
            // Neural net prediction
            const pred = predecirRedNeuronal(
              nn as Parameters<typeof predecirRedNeuronal>[0],
              featureVector
            )

            // Add probability distribution (normalize to [0,1] — NN outputs are scaled 0-100)
            const nnMax = Math.max(...pred.salidas.slice(0, 100), 1)
            for (let i = 0; i < Math.min(100, pred.salidas.length); i++) {
              const existing = scores.get(i) || 0
              scores.set(i, existing + (pred.salidas[i] / nnMax) * 0.3)
            }
            contributions.neuralNet += 0.3
            modelCount++
          }
        }

        if (stored.tipo === "markov" && stored.modelo) {
          const mk = stored.modelo as { matrizTransicion?: number[][]; orden?: number }
          if (mk.matrizTransicion) {
            // Markov: predict next numbers from last drawn
            const lastNums = sequences[sequences.length - 1] || []
            const markovScores = new Map<number, number>()

            for (const num of lastNums) {
              if (num >= 0 && num < 100 && mk.matrizTransicion[num]) {
                for (let j = 0; j < 100; j++) {
                  const prob = mk.matrizTransicion[num][j] || 0
                  markovScores.set(j, (markovScores.get(j) || 0) + prob)
                }
              }
            }

            // Normalize and add
            const maxMarkov = Math.max(...Array.from(markovScores.values()), 1)
            for (const [num, prob] of markovScores) {
              const existing = scores.get(num) || 0
              scores.set(num, existing + (prob / maxMarkov) * 0.3)
            }
            contributions.markov += 0.3
            modelCount++
          }
        }
      } catch (e) {
        // Model deserialization or prediction failed, skip
        continue
      }
    }

    if (modelCount === 0) return empty

    // Normalize scores to [0, 1]
    const maxScore = Math.max(...Array.from(scores.values()), 1)
    for (const [num, score] of scores) {
      scores.set(num, score / maxScore)
    }

    return {
      scores,
      modelContributions: contributions,
      available: true,
    }
  } catch (e) {
    logger.warn("[ml-integration] Failed to load/predict", { error: String(e), turno })
    return empty
  }
}

/**
 * Score 3C/4C candidate numbers using trained ML models (RF + NN + Markov).
 * Uses mod 100 of each candidate to look up2C model scores as proxy.
 * Returns scores only for the specified candidates.
 */
export async function getMLPredictionsForCandidates(
  turno: string,
  recentDraws: Array<{ fecha: string; turno: string; numbers: number[] }>,
  candidates: number[],
  digitSpace: 2 | 3 | 4,
): Promise<MLPrediction> {
  const empty: MLPrediction = {
    scores: new Map(),
    modelContributions: { randomForest: 0, neuralNet: 0, markov: 0 },
    available: false,
  }

  if (recentDraws.length < 10 || candidates.length === 0) return empty

  try {
    const supabase = getSupabaseAdmin()
    const { data: modelData } = await supabase
      .from("ml_models")
      .select("modelos")
      .eq("turno", turnoCanonico(turno))
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()

    if (!modelData?.modelos) return empty

    const modelos: StoredModel[] = Array.isArray(modelData.modelos)
      ? modelData.modelos
      : JSON.parse(modelData.modelos as string)

    const featureVector = prepararPrediccion(recentDraws)
    const sequences = recentDraws.map(d => d.numbers.map(n => n % 100))

    // Score each candidate using mod 100 proxy
    const scores = new Map<number, number>()
    const contributions = { randomForest: 0, neuralNet: 0, markov: 0 }
    let modelCount = 0

    for (const stored of modelos) {
      try {
        if (stored.tipo === "random-forest" && stored.modelo) {
          const rf = deserializarRandomForest(JSON.stringify(stored.modelo))
          if (rf.entrenado && rf.arbres.length > 0) {
            const rfPred = predecirRandomForest(rf, featureVector)
            for (const num of candidates) {
              const proxy = num % 100
              const existing = scores.get(num) || 0
              scores.set(num, existing + (rfPred.probabilidades[proxy] || 0) * 0.4)
            }
            contributions.randomForest += 0.4
            modelCount++
          }
        }

        if (stored.tipo === "neural" && stored.modelo) {
          const nn = stored.modelo as { capas?: unknown[]; tasaAprendizaje?: number }
          if (nn.capas && nn.capas.length > 0) {
            const pred = predecirRedNeuronal(
              nn as Parameters<typeof predecirRedNeuronal>[0],
              featureVector
            )
            const nnMax = Math.max(...pred.salidas.slice(0, 100), 1)
            for (const num of candidates) {
              const proxy = num % 100
              const existing = scores.get(num) || 0
              scores.set(num, existing + ((pred.salidas[proxy] || 0) / nnMax) * 0.3)
            }
            contributions.neuralNet += 0.3
            modelCount++
          }
        }

        if (stored.tipo === "markov" && stored.modelo) {
          const mk = stored.modelo as { matrizTransicion?: number[][]; orden?: number }
          if (mk.matrizTransicion) {
            const lastNums = sequences[sequences.length - 1] || []
            const markovScores = new Map<number, number>()

            for (const num of lastNums) {
              if (num >= 0 && num < 100 && mk.matrizTransicion[num]) {
                for (let j = 0; j < 100; j++) {
                  const prob = mk.matrizTransicion[num][j] || 0
                  markovScores.set(j, (markovScores.get(j) || 0) + prob)
                }
              }
            }

            const maxMarkov = Math.max(...Array.from(markovScores.values()), 1)
            for (const num of candidates) {
              const proxy = num % 100
              const prob = markovScores.get(proxy) || 0
              const existing = scores.get(num) || 0
              scores.set(num, existing + (prob / maxMarkov) * 0.3)
            }
            contributions.markov += 0.3
            modelCount++
          }
        }
      } catch { continue }
    }

    if (modelCount === 0) return empty

    const maxScore = Math.max(...Array.from(scores.values()), 1)
    for (const [num, score] of scores) {
      scores.set(num, score / maxScore)
    }

    return { scores, modelContributions: contributions, available: true }
  } catch {
    return empty
  }
}
