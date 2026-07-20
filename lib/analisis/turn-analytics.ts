/**
 * Turn Analytics Orchestrator
 * 
 * Pre-calculates all advanced statistical analyses (Shannon Entropy,
 * Survival Analysis, Inter-Turno Markov, Genetic Weight Optimization)
 * and stores results in the `turn_analytics` table for instant UI delivery.
 * 
 * Designed to run in the cron-scrape webhook after scraping completes.
 */

import { createClient } from '@supabase/supabase-js'
import { computeShannonEntropy, getEntropyScores } from './shannon-entropy'
import { computeSurvivalAnalysis, getSurvivalScores } from './survival'
import { computeInterTurnoMarkov, getMarkovScores, isLowEntropyState } from './inter-turno-markov'
import { optimizeWeights } from './genetic-weights'
import logger from '@/lib/logger'

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const supabase = createClient(SB_URL || 'http://localhost', SK_KEY || 'dummy')

const TURNOS = ['Matutina', 'Vespertina', 'Nocturna']

export interface TurnAnalyticsData {
  turno: string
  entropy: ReturnType<typeof computeShannonEntropy>
  survival: ReturnType<typeof computeSurvivalAnalysis>
  markov: ReturnType<typeof computeInterTurnoMarkov>
  geneticWeights: ReturnType<typeof optimizeWeights>
  entropyScores: number[]
  survivalScores: number[]
  markovScores: number[]
}

/**
 * Fetch recent draw sequences for a specific turno.
 */
async function fetchTurnSequences(
  turno: string,
  limit: number = 500
): Promise<number[][]> {
  const { data, error } = await supabase
    .from('draws')
    .select('numbers')
    .ilike('turno', `%${turno}%`)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) {
    logger.error(`[turn-analytics] Failed to fetch draws for ${turno}:`, { error: String(error) })
    return []
  }

  return (data ?? []).map(d => d.numbers ?? [])
}

/**
 * Fetch all turno sequences for inter-turno analysis.
 */
async function fetchAllTurnSequences(
  limit: number = 500
): Promise<Map<string, number[][]>> {
  const result = new Map<string, number[][]>()

  const entries = await Promise.all(
    TURNOS.map(async (turno) => {
      const seqs = await fetchTurnSequences(turno, limit)
      return [turno, seqs] as const
    })
  )

  for (const [turno, seqs] of entries) {
    result.set(turno, seqs)
  }

  return result
}

/**
 * Compute complete analytics for a single turno.
 */
export async function computeTurnAnalytics(
  turno: string,
  allTurnSequences: Map<string, number[][]>
): Promise<TurnAnalyticsData> {
  const sequences = await fetchTurnSequences(turno)
  const recentWindow = sequences.slice(0, 200)

  logger.info(`[turn-analytics] Computing analytics for ${turno} (${sequences.length} draws)`)

  // 1. Shannon Entropy
  const entropy = computeShannonEntropy(recentWindow)
  const entropyScores = getEntropyScores(entropy)

  // 2. Survival Analysis
  const survival = computeSurvivalAnalysis(sequences)
  const survivalScores = getSurvivalScores(survival)

  // 3. Inter-Turno Markov (order 2)
  const markov = computeInterTurnoMarkov(allTurnSequences, 2)
  // Use current state = last digits of Matutina and Vespertina (or first 2 turns)
  const currentState = TURNOS.slice(0, 2).map(name => {
    const seqs = allTurnSequences.get(name)
    return (seqs?.[0]?.[0] ?? 0) % 100
  })
  const markovScores = getMarkovScores(markov, currentState)

  // 4. Genetic Weight Optimization
  // Build engine predictions from available analyzers
  const enginePredictions: number[][] = [
    entropyScores,
    survivalScores,
    markovScores
  ]

  // Actual numbers for fitness evaluation
  const actualNumbers = recentWindow

  const geneticWeights = optimizeWeights(
    enginePredictions,
    actualNumbers,
    enginePredictions.length,
    {
      populationSize: 30,
      generations: 50,
      fitnessWindow: 100
    }
  )

  return {
    turno,
    entropy,
    survival,
    markov,
    geneticWeights,
    entropyScores,
    survivalScores,
    markovScores
  }
}

/**
 * Save pre-calculated analytics to the turn_analytics table.
 */
async function saveTurnAnalytics(data: TurnAnalyticsData): Promise<void> {
  const { entropy, survival, markov, geneticWeights } = data

  // Composite confidence score
  const entropyFactor = 1 - entropy.entropy  // Lower entropy = higher confidence
  const survivalFactor = survival.criticalNumbers.length > 0
    ? survival.criticalNumbers[0].zScore / 3  // Normalize z-score
    : 0.5
  const markovFactor = markov.patterns.length > 0
    ? Math.min(1, markov.patterns[0].lift / 5)  // Normalize lift
    : 0.5
  const geneticFactor = geneticWeights.bestFitness

  const compositeConfidence = (
    entropyFactor * 0.25 +
    survivalFactor * 0.25 +
    markovFactor * 0.3 +
    geneticFactor * 0.2
  )

  const payload = {
    turno: data.turno,
    fecha_calculo: new Date().toISOString(),
    markov_transitions: Object.fromEntries(
      Array.from(markov.transitions.entries()).map(([state, probs]) => [
        state,
        Object.fromEntries(Array.from(probs.entries()).map(([num, p]) => [
          String(num),
          { probability: p.probability, support: p.support }
        ]))
      ])
    ),
    entropy_value: entropy.entropy,
    entropy_trend: entropy.trend,
    entropy_alert: entropy.alert,
    survival_hazard: Object.fromEntries(
      survival.hazardRates.map((h, i) => [String(i), h])
    ),
    survival_critical_numbers: survival.criticalNumbers.map(c => ({
      number: c.number,
      hazard: c.hazard,
      z_score: c.zScore,
      risk_percentile: c.riskPercentile,
      classification: c.classification
    })),
    genetic_weights: Object.fromEntries(
      geneticWeights.optimalWeights.map((w, i) => [`engine_${i}`, w])
    ),
    genetic_fitness: geneticWeights.bestFitness,
    composite_confidence: compositeConfidence
  }

  // Upsert (one record per turno per day)
  const today = new Date().toISOString().split('T')[0]
  const { error } = await supabase
    .from('turn_analytics')
    .upsert({ ...payload, fecha: today }, {
      onConflict: 'turno,fecha',
      ignoreDuplicates: false
    })

  if (error) {
    logger.error(`[turn-analytics] Failed to save for ${data.turno}:`, { error: String(error) })
  } else {
    logger.info(`[turn-analytics] Saved analytics for ${data.turno} (confidence: ${compositeConfidence.toFixed(3)})`)
  }
}

/**
 * Run complete analytics pipeline for all turnos.
 * Called from cron-scrape after scraping completes.
 */
export async function computeAllTurnAnalytics(): Promise<void> {
  logger.info('[turn-analytics] Starting full analytics computation')

  const allTurnSequences = await fetchAllTurnSequences()

  for (const turno of TURNOS) {
    try {
      const data = await computeTurnAnalytics(turno, allTurnSequences)
      await saveTurnAnalytics(data)
    } catch (err) {
      logger.error(`[turn-analytics] Error computing for ${turno}:`, { error: String(err) })
    }
  }

  logger.info('[turn-analytics] Full analytics computation complete')
}

/**
 * Get latest analytics for a turno (for API consumption).
 */
export async function getLatestAnalytics(turno: string) {
  const { data, error } = await supabase
    .from('turn_analytics')
    .select('*')
    .ilike('turno', `%${turno}%`)
    .order('fecha_calculo', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data
}
