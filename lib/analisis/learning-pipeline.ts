/**
 * Continuous Learning Pipeline
 *
 * Weekly orchestrator that coordinates all learning subsystems:
 *   1. Factor accuracy evaluation (from factor-feedback)
 *   2. Genetic weight optimization — DESHABILITADO por fuga genética
 *   3. Calibration curve update (from calibration)
 *   4. Persist optimal weights to DB
 *
 * Runs weekly (Sundays 03:00) via cron-learning endpoint.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import { evaluateAndAdjustWeights, evaluateAllTurnos } from "@/lib/analisis/factor-feedback"
import logger from "@/lib/logger"

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

const FACTOR_NAMES = [
  "calor", "demora", "afinidad", "markov", "bayesian", "entropy",
  "survival", "cyclic", "drift", "correlation", "seasonal", "montecarlo",
]

interface PipelineResult {
  weeklyAccuracy: number
  factorEvaluations: { turno: string; hitRate: number; weightsChanged: boolean }[]
  geneticOptimization: {
    bestFitness: number
    convergenceGeneration: number
    optimalWeights: number[]
  } | null
  weightAdjustments: number
  duration: number
}

/**
 * Run the full weekly learning pipeline.
 */
export async function runLearningPipeline(): Promise<PipelineResult> {
  const t0 = Date.now()
  const supabase = getSupabaseAdmin()

  logger.info("learning-pipeline: starting weekly pipeline")

  // 1. Evaluate all turnos for the last 7 days
  const factorEvaluations: PipelineResult["factorEvaluations"] = []
  let totalHits = 0
  let totalPredictions = 0

  for (const turno of TURNOS) {
    try {
      // Evaluate last 7 days
      for (let d = 1; d <= 7; d++) {
        const fecha = new Date()
        fecha.setDate(fecha.getDate() - d)
        const fechaStr = fecha.toISOString().split("T")[0]

        const result = await evaluateAndAdjustWeights(turno, fechaStr)
        if (result) {
          factorEvaluations.push({
            turno,
            hitRate: result.hitRate,
            weightsChanged: Object.keys(result.newWeights).some(
              k => result.newWeights[k as keyof typeof result.newWeights] !==
                   result.previousWeights[k as keyof typeof result.previousWeights]
            ),
          })
          totalHits += Math.round(result.hitRate * 10)
          totalPredictions += 10
        }
      }
    } catch (e) {
      logger.error("learning-pipeline: factor evaluation failed", {
        turno,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const weeklyAccuracy = totalPredictions > 0 ? totalHits / totalPredictions : 0

  // 2. Optimización genética de pesos — DESHABILITADA (fuga genética)
  // El bloque anterior construía las "predicciones" de cada motor con
  // SUBCONJUNTOS de los PROPIOS números reales del sorteo (comments incluidos:
  // "uses the draw's numbers as a proxy") y evaluaba el fitness contra esos
  // mismos resultados: el optimizador veía la respuesta (fitness sin
  // significado) y, además, rankeaba índices de vector en lugar de valores de
  // número. El resultado solo se logueaba en cron-learning y nunca se aplicaba
  // a los motores reales → se elimina el cálculo y se devuelve null.
  // La evaluación honesta por factor (hitRate real contra sorteos oficiales)
  // sigue siendo la sección 1 (factor-feedback).
  const geneticOptimization: PipelineResult["geneticOptimization"] = null

  // 3. Count weight adjustments
  const weightAdjustments = factorEvaluations.filter(e => e.weightsChanged).length

  const duration = Date.now() - t0

  logger.info("learning-pipeline: weekly pipeline complete", {
    weeklyAccuracy: Math.round(weeklyAccuracy * 100),
    factorEvaluations: factorEvaluations.length,
    geneticOptimization: !!geneticOptimization,
    weightAdjustments,
    duration,
  })

  return {
    weeklyAccuracy,
    factorEvaluations,
    geneticOptimization,
    weightAdjustments,
    duration,
  }
}
