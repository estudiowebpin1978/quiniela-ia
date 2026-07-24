/**
 * Domain Service: Score normalization and ranking
 */
import type { PredictionScore } from "../value-objects/prediction-score"

export interface RankedNumber {
  numero: number
  padded: string
  score: number
  normalizedScore: number
  rank: number
  isHot: boolean
  isCold: boolean
  factors: string[]
}

/**
 * Normalize scores to 0-1 range and rank by score descending
 */
export function normalizeAndRank(
  scores: PredictionScore[],
  factors?: Map<number, string[]>,
): RankedNumber[] {
  if (scores.length === 0) return []

  const maxScore = Math.max(...scores.map(s => s.score))
  const minScore = Math.min(...scores.map(s => s.score))
  const range = maxScore - minScore || 1

  const ranked = scores
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({
      numero: s.num,
      padded: s.padded,
      score: s.score,
      normalizedScore: (s.score - minScore) / range,
      rank: i + 1,
      isHot: s.isHot(),
      isCold: s.isCold(),
      factors: factors?.get(s.num) ?? [],
    }))

  return ranked
}

/**
 * Select top N numbers for 2c predictions
 */
export function selectTop2c(ranked: RankedNumber[], n: number = 10): string[] {
  return ranked.slice(0, n).map(r => r.padded)
}

/**
 * Select top N numbers for 3c predictions
 */
export function selectTop3c(ranked: RankedNumber[], n: number = 10): string[] {
  return ranked.slice(0, n).map(r => String(r.numero).padStart(3, "0"))
}

/**
 * Select top N numbers for 4c predictions
 */
export function selectTop4c(ranked: RankedNumber[], n: number = 10): string[] {
  return ranked.slice(0, n).map(r => String(r.numero).padStart(4, "0"))
}
