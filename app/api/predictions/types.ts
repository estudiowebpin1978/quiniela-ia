/**
 * Type definitions for Prediction API response.
 * Replaces `any` usage with concrete interfaces.
 */

// ── Monte Carlo ──────────────────────────────────────────────────────

export interface MonteCarloItem {
  number: number
  probability: number
  score?: number
}

// ── Sync Status ──────────────────────────────────────────────────────

export interface SyncStatus {
  sincronizado: boolean
  nuevos_sorteos: number
}

// ── CDM Model ────────────────────────────────────────────────────────

export interface CDMTopItem {
  numero: string
  posterior: string
}

// ── Advanced Analytics Debug ─────────────────────────────────────────

export interface EntropyDebug {
  value: string
  classification: string
  alert: boolean
  trend: string
}

export interface SurvivalCriticalItem {
  numero: string
  zScore: string
  classification: string
  riskPercentile: string
}

export interface SurvivalDebug {
  criticalCount: number
  topCritical: SurvivalCriticalItem[]
  overallHazard: string
}

export interface MarkovPatternDebug {
  state: string
  nextNumber: string
  probability: string
  lift: string
}

export interface InterTurnoDebug {
  order: number
  patternsFound: number
  totalTransitions: number
  topPatterns: MarkovPatternDebug[]
}

export interface GeneticWeightItem {
  engine: string
  weight: string
}

export interface GeneticDebug {
  weights: GeneticWeightItem[]
}

export interface CachedAnalyticsDebug {
  compositeConfidence: number
  calculatedAt: string
}

export interface AdvancedAnalytics {
  entropy: EntropyDebug | null
  survival: SurvivalDebug | null
  interTurno: InterTurnoDebug | null
  genetic: GeneticDebug | null
  cachedAnalytics: CachedAnalyticsDebug | null
}

// ── Debug Payload ────────────────────────────────────────────────────

export interface DebugPayload {
  elapsed_ms: number
  factores_aplicados: number
  motores_activos: number
  total_numeros: number
  determinista: boolean
  sorteos_analizados: number
  sync: SyncStatus | null
  cdm_model: {
    activo: boolean
    topNumeros: CDMTopItem[]
  }
  advanced_analytics: AdvancedAnalytics
  dynamic_weights: Record<string, number> | null
}

// ── Score Item ───────────────────────────────────────────────────────

export interface ScoreItem {
  num: number
  score: number
  confianza: number
  factores: string[]
  frecuencia: number
  crossTurno: number
  pesoAjustado: number
  bayesianConfidence?: number
  bayesianPosterior?: number
  bayesianCiWidth?: number
}

// ── Top Numero (response) ────────────────────────────────────────────

export interface TopNumero {
  n: number
  numero: string
  emoji: string
  significado: string
  score: number
  confianza: number
  rank: number
  frecuencia: number
  factores: string[]
  bayesianConfidence?: number
  bayesianPosterior?: number
  highConfidence?: boolean
}

// ── Heatmap ──────────────────────────────────────────────────────────

export interface HeatmapItem {
  n: number
  f: number
  s: { emoji: string; nombre: string }
  pct: number
}

// ── Stats ────────────────────────────────────────────────────────────

export interface StatsPayload {
  totalNumeros: number
  promedioPorSorteo: string
  numeroMasFrecuente: { numero: string; frecuencia: number; significado: string }
  terminacionesMasFrecuentes: { terminacion: number; frecuencia: number; score: string }[]
}

// ── Analysis Info ────────────────────────────────────────────────────

export interface AnalysisInfoPayload {
  metodo: string
  motores: string[]
  datosUtilizados: string
  confianzaAvanzada: {
    promedioGeneral: number
    enCicloFavorable: string[]
    evitar: string[]
  }
}

// ── Full Response ────────────────────────────────────────────────────

export interface PredictionResponse {
  ok: boolean
  turno: string
  tier: string
  isPremium: boolean
  isTrialActive: boolean
  trialExpired: boolean
  predictionsUsed: number
  predictionsRemaining: number
  canAccessPremiumFeatures: boolean
  upgradeHint: string | null
  aiSummary: string | null
  aiProvider: string | null
  debug: DebugPayload
  numeros: TopNumero[]
  totalSorteos: number
  fechasAnalizadas: number
  generado: string
  confidence: number
  pred: {
    numeros_2: string[]
    numeros_3: string[]
    numeros_4: string[]
    redoblona: string | null
  }
  redoblona: string | null
  heatmap: HeatmapItem[]
  stats: StatsPayload
  analysisInfo: AnalysisInfoPayload
}

// ── Heavy Cache Scores ───────────────────────────────────────────────

export interface HeavyCacheScores {
  monteCarloTop: MonteCarloItem[]
  correlationScores: number[]
  markovSuperScores: number[]
  cyclicScores: number[]
  graphScores: number[]
  featureScores: number[]
  multilevelScores: number[]
  pmiScores: number[]
  advMarkovScores: number[]
  positionScores: number[]
  entropyScores: number[]
  survivalScores: number[]
  interTurnoScores: number[]
  geneticOptimalWeights: number[] | null
  ensembleMLScores: number[]
  cdmScores: { number: number; posterior: number }[]
  crossTurnoScore: Record<number, number>
}

// ── Draw Row (from Supabase) ─────────────────────────────────────────

export interface DrawRow {
  date: string
  turno: string
  numbers: number[]
  fecha: string // mapped from date
}

// ── Sorteo (for motor analysis) ──────────────────────────────────────

export interface SorteoRow {
  fecha: string
  turno: string
  numbers: number[]
}

// ── Turn Analytics (from Supabase turn_analytics table) ──────────────

export interface TurnAnalyticsRow {
  turno: string
  fecha: string
  entropy_scores: number[]
  survival_scores: number[]
  markov_scores: number[]
  genetic_weights: Record<string, number>
  composite_confidence: number
  fecha_calculo: string
}
