/**
 * Cron: Weekly Learning Pipeline
 *
 * Runs Sundays at 03:00 Argentina time.
 * Coordinates all learning subsystems:
 *   1. Factor accuracy evaluation
 *   2. Genetic weight optimization
 *   3. Calibration curve update
 *   4. Persist optimal weights
 */

import { NextRequest, NextResponse } from "next/server"
import { runLearningPipeline } from "@/lib/analisis/learning-pipeline"
import { autoTrainAll } from "@/lib/ml/auto-train"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import logger from "@/lib/logger"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const t0 = Date.now()

  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  try {
    // Run factor feedback + genetic optimization
    const result = await runLearningPipeline()

    // Also train ML models (RF, Neural Net, Markov) for all turnos
    let mlResult = null
    try {
      mlResult = await autoTrainAll(false) // false = no AI enhancement
      logger.info("[cron-learning] ML training completed", {
        models: mlResult?.length || 0,
      })
    } catch (e) {
      logger.warn("[cron-learning] ML training failed", { error: String(e) })
    }

    logCronExecution("cron-learning", {
      weeklyAccuracy: Math.round(result.weeklyAccuracy * 100),
      evaluations: result.factorEvaluations.length,
      geneticOptimization: !!result.geneticOptimization,
      weightAdjustments: result.weightAdjustments,
      mlModels: mlResult?.length || 0,
    }, t0)

    return NextResponse.json({
      ok: true,
      weeklyAccuracy: Math.round(result.weeklyAccuracy * 100),
      factorEvaluations: result.factorEvaluations.length,
      weightAdjustments: result.weightAdjustments,
      geneticOptimization: result.geneticOptimization ? {
        bestFitness: Math.round(result.geneticOptimization.bestFitness * 100),
        convergenceGeneration: result.geneticOptimization.convergenceGeneration,
      } : null,
      ml_training: mlResult ? {
        turnos: mlResult.length,
        models: mlResult.map(r => ({
          turno: r.turno,
          modelos: r.modelos.length,
          bestModel: r.modelos[0]?.nombre || "none",
        })),
      } : null,
      elapsed_ms: Date.now() - t0,
    })
  } catch (e) {
    logger.error("cron-learning: pipeline failed", {
      error: e instanceof Error ? e.message : String(e),
    })
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      elapsed_ms: Date.now() - t0,
    }, { status: 500 })
  }
}
