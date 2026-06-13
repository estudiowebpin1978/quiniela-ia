/**
 * Deep Learning Model Loader
 * Loads LSTM, Transformer, and BNN predictions from exported JSON files.
 */

import * as fs from "fs"
import * as path from "path"

interface DeepLearningResult {
  scores: Record<string, number>;
  top10: number[];
  uncertainty?: Record<string, number>;
}

const EXPORT_DIR = path.join(process.cwd(), "modelos_exportados")

/**
 * Load deep learning ensemble predictions for a turno.
 * Returns combined scores from LSTM + Transformer + BNN.
 */
export function loadDeepLearning(turno: string): DeepLearningResult | null {
  try {
    const filePath = path.join(EXPORT_DIR, `deep_learning_${turno}.json`)
    if (!fs.existsSync(filePath)) return null

    const raw = fs.readFileSync(filePath, "utf-8")
    const data = JSON.parse(raw)

    if (!data.ensemble) return null

    return {
      scores: data.ensemble.scores || {},
      top10: data.ensemble.top10 || [],
      uncertainty: data.bnn?.uncertainty || {}
    }
  } catch {
    return null
  }
}

/**
 * Get deep learning boost for a specific number.
 * Returns a score [0, 1] based on LSTM + Transformer + BNN ensemble.
 */
export function getDeepLearningBoost(turno: string, num: number): number {
  const dl = loadDeepLearning(turno)
  if (!dl) return 0

  const key = String(num)
  return dl.scores[key] || 0
}

/**
 * Get uncertainty estimate for a number (from BNN).
 * Higher uncertainty = less confident in the prediction.
 */
export function getPredictionUncertainty(turno: string, num: number): number {
  const dl = loadDeepLearning(turno)
  if (!dl || !dl.uncertainty) return 0.5

  const key = String(num)
  return dl.uncertainty[key] || 0.5
}
