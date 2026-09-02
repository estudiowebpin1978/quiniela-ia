/**
 * MOTOR OMEGA V7 — Enhanced TypeScript Engine
 *
 * Integrates analysis modules into a single prediction pipeline:
 *   1. Survival/Kaplan-Meier (overdue numbers)
 *   2. Correlation (co-occurring pairs)
 *   3. Spacing analysis (interval distributions)
 *   4. Frequency analysis (multi-window)
 *   5. Recency (exponential decay)
 *   6. Transition analysis (Markov)
 *   7. Cycle detection
 *   8. Temporal patterns (day-of-week)
 *   9. Debt analysis (overdue score)
 *  10. Bayesian posterior
 */

import { computeSurvivalAnalysis } from "./survival"
import { analyzeCorrelations } from "./correlation"
import { analizarCiclos } from "./ciclos"
import { analizarFrecuencia } from "./frecuencia"
import { analizarTransicion } from "./transicion"
import {
  loadPrecomputedStats,
  getFrequencyScore,
  getRecencyScore,
  getMarkovScore,
  getCooccurrenceScore,
  type PrecomputedStats,
} from "./precomputed"
import logger from "@/lib/logger"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Draw {
  fecha: string
  turno: string
  numbers: number[]
}

export interface Prediction {
  numero: string
  score: number
  factors: FactorBreakdown
}

export interface FactorBreakdown {
  survival: number
  correlation: number
  spacing: number
  frequency: number
  recency: number
  markov: number
  cycles: number
  temporal: number
  debt: number
  bayesian: number
}

const DEFAULT_WEIGHTS: FactorBreakdown = {
  survival: 0.18,
  correlation: 0.12,
  spacing: 0.14,
  frequency: 0.15,
  recency: 0.10,
  markov: 0.08,
  cycles: 0.06,
  temporal: 0.07,
  debt: 0.10,
  bayesian: 0.00,
}

const ENSEMBLE_WEIGHTS: FactorBreakdown[] = [
  { survival: 0.25, correlation: 0.10, spacing: 0.15, frequency: 0.12, recency: 0.08, markov: 0.06, cycles: 0.05, temporal: 0.06, debt: 0.10, bayesian: 0.03 },
  { survival: 0.12, correlation: 0.14, spacing: 0.10, frequency: 0.22, recency: 0.12, markov: 0.08, cycles: 0.06, temporal: 0.06, debt: 0.06, bayesian: 0.04 },
  { survival: 0.15, correlation: 0.12, spacing: 0.12, frequency: 0.15, recency: 0.10, markov: 0.08, cycles: 0.08, temporal: 0.08, debt: 0.08, bayesian: 0.04 },
  { survival: 0.10, correlation: 0.20, spacing: 0.10, frequency: 0.12, recency: 0.08, markov: 0.10, cycles: 0.06, temporal: 0.14, debt: 0.06, bayesian: 0.04 },
]

// ─── Core Engine ────────────────────────────────────────────────────────────

export function predictV7(
  draws: Draw[],
  turno: string,
  topN: number = 10,
  weights: FactorBreakdown = DEFAULT_WEIGHTS,
  contextSeed?: number,
): Prediction[] {
  if (draws.length < 10) throw new Error(`Insufficient data: ${draws.length} draws`)

  const turnoDraws = draws.filter(d => d.turno === turno)
  if (turnoDraws.length < 5) throw new Error(`Insufficient data for turno ${turno}`)

  // Extract number sequences (2-digit: 00-99)
  const sequences = turnoDraws.map(d => d.numbers.map(n => n % 100))

  // ── Run analyses ────────────────────────────────────────────────────

  // 1. Survival Analysis
  const survival = computeSurvivalAnalysis(sequences)

  // 2. Correlation Analysis
  const correlation = analyzeCorrelations(sequences)

  // 3. Cycle Analysis
  const cycles = analizarCiclos(turnoDraws)

  // 4. Frequency Analysis (multi-window)
  const freqShort = analizarFrecuencia(turnoDraws.slice(-7))
  const freqMed = analizarFrecuencia(turnoDraws.slice(-30))
  const freqLong = analizarFrecuencia(turnoDraws.slice(-90))

  // 5. Transition Analysis (Markov)
  const transitions = analizarTransicion(turnoDraws)

  // 6. Spacing Scores
  const spacingScores = computeSpacingScores(sequences)

  // 7. Temporal Patterns
  const temporalScores = computeTemporalPatterns(turnoDraws)

  // 8. Debt Scores
  const debtScores = computeDebtScores(sequences)

  // 9. Bayesian Posterior
  const bayesianScores = computeBayesianPosterior(sequences)

  // ── Build frequency lookup maps ─────────────────────────────────────
  const freqShortMap = new Map<number, number>()
  for (const item of freqShort.dosCifras) {
    freqShortMap.set(item.numero, item.frecuencia)
  }
  const freqMedMap = new Map<number, number>()
  for (const item of freqMed.dosCifras) {
    freqMedMap.set(item.numero, item.frecuencia)
  }
  const freqLongMap = new Map<number, number>()
  for (const item of freqLong.dosCifras) {
    freqLongMap.set(item.numero, item.frecuencia)
  }

  // ── Build cycle lookup map ──────────────────────────────────────────
  const cycleMap = new Map<number, number>()
  for (const item of cycles.ciclos2Cifras) {
    // Score: lower cicloPromedio = more frequent = higher score
    cycleMap.set(item.numero, item.cicloPromedio > 0 ? 1 / item.cicloPromedio : 0)
  }

  // ── Build transition lookup ─────────────────────────────────────────
  const transMat = transitions.matriz2Cifras.matriz

  // Deterministic seed from EngineContext — same context = same predictions
  // Fallback to date-based hash if no context provided (backward compat)
  let dateHash: number
  if (contextSeed !== undefined) {
    dateHash = contextSeed
  } else {
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
    const seedStr = `${todayStr}-${turno}`
    dateHash = 0
    for (let i = 0; i < seedStr.length; i++) { dateHash = ((dateHash << 5) - dateHash + seedStr.charCodeAt(i)) | 0 }
  }

  // ── Score each number (0-99) ────────────────────────────────────────
  const scores: Prediction[] = []
  const maxFreqShort = Math.max(...Array.from(freqShortMap.values()), 1)
  const maxFreqMed = Math.max(...Array.from(freqMedMap.values()), 1)
  const maxFreqLong = Math.max(...Array.from(freqLongMap.values()), 1)

  for (let num = 0; num < 100; num++) {
    // Survival: normalize hazard
    const sHazard = survival.hazardRates[num] || 0
    const maxHazard = Math.max(...survival.hazardRates.filter(h => h > 0), 1)
    const sNormalized = sHazard / maxHazard

    // Correlation: score from co-occurrence
    const cScore = correlation.numberScores[num] || 0

    // Spacing
    const spScore = spacingScores[num] || 0

    // Frequency: multi-window weighted
    const fShort = (freqShortMap.get(num) || 0) / maxFreqShort
    const fMed = (freqMedMap.get(num) || 0) / maxFreqMed
    const fLong = (freqLongMap.get(num) || 0) / maxFreqLong
    const fScore = fShort * 0.4 + fMed * 0.35 + fLong * 0.25

    // Recency: exponential decay
    const lastIdx = findLastAppearance(sequences, num)
    const recencyScore = lastIdx >= 0
      ? Math.exp(-0.05 * (sequences.length - 1 - lastIdx))
      : 0.1

    // Markov: transition from last drawn numbers
    const lastDrawn = sequences[sequences.length - 1] || []
    let markovScore = 0
    for (const prev of lastDrawn) {
      if (prev >= 0 && prev < 100 && transMat[prev]) {
        markovScore += transMat[prev][num] || 0
      }
    }
    markovScore = lastDrawn.length > 0 ? markovScore / lastDrawn.length : 0

    // Cycles
    const cycleScore = cycleMap.get(num) || 0

    // Temporal
    const tScore = temporalScores[num] || 0

    // Debt
    const dScore = debtScores[num] || 0

    // Bayesian
    const bScore = bayesianScores[num] || 0

    // Combine with weights + daily perturbation (±2% to break ties and create daily variation)
    const dailyPerturb = ((dateHash * 31 + num * 17) | 0) % 100
    const perturbation = 1 + (dailyPerturb - 50) * 0.0004
    const combined =
      (weights.survival * sNormalized +
      weights.correlation * cScore +
      weights.spacing * spScore +
      weights.frequency * fScore +
      weights.recency * recencyScore +
      weights.markov * markovScore +
      weights.cycles * cycleScore +
      weights.temporal * tScore +
      weights.debt * dScore +
      weights.bayesian * bScore) * perturbation

    const numStr = num < 10 ? `0${num}` : `${num}`
    scores.push({
      numero: numStr,
      score: combined,
      factors: {
        survival: sNormalized,
        correlation: cScore,
        spacing: spScore,
        frequency: fScore,
        recency: recencyScore,
        markov: markovScore,
        cycles: cycleScore,
        temporal: tScore,
        debt: dScore,
        bayesian: bScore,
      },
    })
  }

  scores.sort((a, b) => b.score - a.score)
  return scores.slice(0, topN)
}

/**
 * FAST PATH: Predict using pre-calculated materialized view stats.
 * O(100) instead of O(n*100) — reads from draw_stats, markov_transitions.
 * Falls back to full engine if stats unavailable.
 */
export async function predictV7Fast(
  turno: string,
  topN: number = 10,
  weights: FactorBreakdown = DEFAULT_WEIGHTS,
  contextSeed?: number,
): Promise<{ predictions: Prediction[]; usedPrecomputed: boolean }> {
  const stats = await loadPrecomputedStats(turno)

  if (!stats || stats.drawStats.length === 0) {
    return { predictions: [], usedPrecomputed: false }
  }

  const totalDraws = stats.total_draws

  // Build lookup maps for O(1) access
  const freqMap = new Map<number, { global: number; w7: number; w30: number; w90: number }>()
  for (const ds of stats.drawStats) {
    freqMap.set(ds.num, {
      global: ds.global_freq,
      w7: ds.freq_7,
      w30: ds.freq_30,
      w90: ds.freq_90,
    })
  }

  // Find max frequencies for normalization
  let maxGlobal = 1, maxW7 = 1, maxW30 = 1, maxW90 = 1
  for (const ds of stats.drawStats) {
    if (ds.global_freq > maxGlobal) maxGlobal = ds.global_freq
    if (ds.freq_7 > maxW7) maxW7 = ds.freq_7
    if (ds.freq_30 > maxW30) maxW30 = ds.freq_30
    if (ds.freq_90 > maxW90) maxW90 = ds.freq_90
  }

  // Pre-compute top-3 frequent numbers for correlation (outside loop)
  const topFreqNums = stats.drawStats
    .slice()
    .sort((a, b) => b.global_freq - a.global_freq)
    .slice(0, 3)

  // Score each number (0-99)
  // Daily seed for ±2% perturbation — use contextSeed if provided, else date-based
  let dateHash: number
  if (contextSeed !== undefined) {
    dateHash = contextSeed
  } else {
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
    dateHash = 0
    for (let i = 0; i < todayStr.length; i++) { dateHash = ((dateHash << 5) - dateHash + todayStr.charCodeAt(i)) | 0 }
  }

  const scores: Prediction[] = []

  for (let num = 0; num < 100; num++) {
    const freq = freqMap.get(num)

    // Survival: use recency as proxy (high last_seen_rank = high hazard)
    const recency = getRecencyScore(num, stats)
    const sNormalized = recency // Overdue = higher survival score

    // Correlation: co-occurrence with top-3 most frequent numbers
    let cScore = 0
    for (const top of topFreqNums) {
      cScore += getCooccurrenceScore(num, top.num, stats)
    }
    cScore = Math.min(1, cScore)

    // Spacing: use avg_gap from stats
    const ds = stats.drawStats.find((s) => s.num === num)
    const avgGap = ds?.avg_gap || totalDraws
    const expectedGap = totalDraws > 0 ? totalDraws / 20 : 1 // ~20 numbers per draw
    const spScore = Math.min(1, (avgGap / expectedGap) * 0.5)

    // Frequency: multi-window from pre-calculated stats
    const fShort = freq ? freq.w7 / maxW7 : 0
    const fMed = freq ? freq.w30 / maxW30 : 0
    const fLong = freq ? freq.w90 / maxW90 : 0
    const fScore = fShort * 0.4 + fMed * 0.35 + fLong * 0.25

    // Recency: exponential decay from last_seen_rank
    const lastSeenRank = ds?.last_seen_rank || totalDraws
    const recencyScore = Math.exp(-0.05 * lastSeenRank)

    // Markov: not available in fast path (no last-drawn context), use 0
    const markovScore = 0

    // Cycles: use avg_gap as cycle proxy
    const cycleScore = avgGap > 0 ? 1 / avgGap : 0

    // Temporal: use short-term frequency trend as proxy for day-of-week patterns
    const f7 = freq ? freq.w7 : 0
    const f30 = freq ? freq.w30 : 0
    const f90 = freq ? freq.w90 : 0
    const trendUp = f7 > f30 / 4 && f30 > f90 / 4
    const trendDown = f7 < f30 / 8
    const tScore = trendUp ? 0.7 : trendDown ? 0.3 : 0.5

    // Debt: use last_seen_rank
    const dScore = Math.min(1, lastSeenRank / 15)

    // Bayesian: frequency / total as posterior
    const bScore = freq ? (freq.global + 1) / (totalDraws + 100) : 1 / 100

    // Combine with weights + daily perturbation (±2%)
    const dailyPerturb = ((dateHash * 31 + num * 17) | 0) % 100
    const perturbation = 1 + (dailyPerturb - 50) * 0.0004
    const combined =
      (weights.survival * sNormalized +
      weights.correlation * cScore +
      weights.spacing * spScore +
      weights.frequency * fScore +
      weights.recency * recencyScore +
      weights.markov * markovScore +
      weights.cycles * cycleScore +
      weights.temporal * tScore +
      weights.debt * dScore +
      weights.bayesian * bScore) * perturbation

    const numStr = num < 10 ? `0${num}` : `${num}`
    scores.push({
      numero: numStr,
      score: combined,
      factors: {
        survival: sNormalized,
        correlation: cScore,
        spacing: spScore,
        frequency: fScore,
        recency: recencyScore,
        markov: markovScore,
        cycles: cycleScore,
        temporal: tScore,
        debt: dScore,
        bayesian: bScore,
      },
    })
  }

  scores.sort((a, b) => b.score - a.score)
  return { predictions: scores.slice(0, topN), usedPrecomputed: true }
}

/**
 * Run ensemble: average scores across multiple weight configs.
 * Uses precomputed stats when available (fast), falls back to full engine.
 */
export async function predictEnsembleV7(
  draws: Draw[],
  turno: string,
  topN: number = 10,
  contextSeed?: number,
  adaptiveWeights?: FactorBreakdown,
): Promise<{ predictions: Prediction[]; ensembleSize: number }> {
  const allWeights = adaptiveWeights
    ? [adaptiveWeights, ...ENSEMBLE_WEIGHTS]
    : [DEFAULT_WEIGHTS, ...ENSEMBLE_WEIGHTS]

  // Try fast path first (materialized views)
  const fastResult = await predictV7Fast(turno, 100, DEFAULT_WEIGHTS, contextSeed)
  if (fastResult.usedPrecomputed && fastResult.predictions.length > 0) {
    logger.info("[engine-v7] using precomputed stats (fast path)", {
      turno,
      statsCount: fastResult.predictions.length,
    })

    const accumulator = new Map<string, { totalScore: number; count: number; factorsSum: FactorBreakdown }>()

    for (const w of allWeights) {
      const result = await predictV7Fast(turno, 100, w, contextSeed)
      for (const pred of result.predictions) {
        const existing = accumulator.get(pred.numero)
        if (existing) {
          existing.totalScore += pred.score
          existing.count++
          for (const key of Object.keys(existing.factorsSum) as (keyof FactorBreakdown)[]) {
            existing.factorsSum[key] += pred.factors[key]
          }
        } else {
          accumulator.set(pred.numero, {
            totalScore: pred.score,
            count: 1,
            factorsSum: { ...pred.factors },
          })
        }
      }
    }

    const predictions: Prediction[] = []
    for (const [num, data] of accumulator) {
      const avgScore = data.totalScore / data.count
      const avgFactors: FactorBreakdown = { ...DEFAULT_WEIGHTS }
      for (const key of Object.keys(avgFactors) as (keyof FactorBreakdown)[]) {
        avgFactors[key] = data.factorsSum[key] / data.count
      }
      predictions.push({ numero: num, score: avgScore, factors: avgFactors })
    }

    predictions.sort((a, b) => b.score - a.score)
    return { predictions: predictions.slice(0, topN), ensembleSize: allWeights.length }
  }

  // Fallback: full engine (raw draws)
  logger.info("[engine-v7] using full engine (no precomputed stats)", { turno })
  const accumulator = new Map<string, { totalScore: number; count: number; factorsSum: FactorBreakdown }>()

  for (const w of allWeights) {
    const preds = predictV7(draws, turno, 100, w, contextSeed)
    for (const pred of preds) {
      const existing = accumulator.get(pred.numero)
      if (existing) {
        existing.totalScore += pred.score
        existing.count++
        for (const key of Object.keys(existing.factorsSum) as (keyof FactorBreakdown)[]) {
          existing.factorsSum[key] += pred.factors[key]
        }
      } else {
        accumulator.set(pred.numero, {
          totalScore: pred.score,
          count: 1,
          factorsSum: { ...pred.factors },
        })
      }
    }
  }

  const predictions: Prediction[] = []
  for (const [num, data] of accumulator) {
    const avgScore = data.totalScore / data.count
    const avgFactors: FactorBreakdown = { ...DEFAULT_WEIGHTS }
    for (const key of Object.keys(avgFactors) as (keyof FactorBreakdown)[]) {
      avgFactors[key] = data.factorsSum[key] / data.count
    }
    predictions.push({ numero: num, score: avgScore, factors: avgFactors })
  }

  predictions.sort((a, b) => b.score - a.score)
  return { predictions: predictions.slice(0, topN), ensembleSize: allWeights.length }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function computeSpacingScores(sequences: number[][]): number[] {
  const scores = new Array(100).fill(0)
  for (let num = 0; num < 100; num++) {
    const indices: number[] = []
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i].includes(num)) indices.push(i)
    }
    if (indices.length < 2) continue
    const intervals = indices.slice(1).map((idx, j) => idx - indices[j])
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const currentGap = sequences.length - 1 - indices[indices.length - 1]
    if (avgInterval > 0) {
      scores[num] = Math.min(1, currentGap / (avgInterval * 2))
    }
  }
  return scores
}

function computeTemporalPatterns(draws: Draw[]): number[] {
  const scores = new Array(100).fill(0)
  const todayDow = new Date().getDay()
  const todayDraws = draws.filter(d => new Date(d.fecha).getDay() === todayDow)
  if (todayDraws.length === 0) return scores

  const freq: Record<number, number> = {}
  for (const draw of todayDraws) {
    for (const num of draw.numbers) {
      const t = num % 100
      if (t >= 0 && t < 100) freq[t] = (freq[t] || 0) + 1
    }
  }
  const maxFreq = Math.max(...Object.values(freq), 1)
  for (let num = 0; num < 100; num++) {
    scores[num] = (freq[num] || 0) / maxFreq
  }
  return scores
}

function computeDebtScores(sequences: number[][]): number[] {
  const scores = new Array(100).fill(0)
  for (let num = 0; num < 100; num++) {
    let lastIdx = -1
    for (let i = sequences.length - 1; i >= 0; i--) {
      if (sequences[i].includes(num)) { lastIdx = i; break }
    }
    const gap = lastIdx >= 0 ? sequences.length - 1 - lastIdx : sequences.length
    scores[num] = Math.min(1, gap / 15) // 15 draws = expected gap * 3
  }
  return scores
}

function computeBayesianPosterior(sequences: number[][]): number[] {
  const scores = new Array(100).fill(0)
  const totalDraws = sequences.length
  const alpha = 1 // Dirichlet prior
  for (let num = 0; num < 100; num++) {
    let count = 0
    for (const seq of sequences) {
      if (seq.includes(num)) count++
    }
    scores[num] = (count + alpha) / (totalDraws + 100 * alpha)
  }
  const max = Math.max(...scores)
  const min = Math.min(...scores)
  const range = max - min || 1
  for (let i = 0; i < 100; i++) {
    scores[i] = (scores[i] - min) / range
  }
  return scores
}

function findLastAppearance(sequences: number[][], num: number): number {
  for (let i = sequences.length - 1; i >= 0; i--) {
    if (sequences[i].includes(num)) return i
  }
  return -1
}
