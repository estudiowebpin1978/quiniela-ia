/**
 * Infrastructure: Supabase RPC type definitions
 * Generated from SQL function signatures
 */

// ============================================================================
// RPC Return Types
// ============================================================================

export interface FrequencyStatsRow {
  numero: number
  freq_historica: number
  freq_100: number
  freq_20: number
  total_draws: number
}

export interface AbsenceRecencyRow {
  numero: number
  ausencia_actual: number
  recencia_exp: number
  ciclo_promedio: number
  desviacion_ciclo: number
  ultimo_visto: number
}

export interface EntropyScoreRow {
  numero: number
  score: number
  entropy_value: number
  entropy_trend: string
  entropy_alert: boolean
}

export interface SurvivalScoreRow {
  numero: number
  hazard_rate: number
  mean_gap: number
  current_delay: number
  z_score: number
  risk_percentile: number
  classification: string
}

export interface MarkovTransitionRow {
  state: string
  next_number: number
  probability: number
  support: number
  lift: number
  confidence: number
}

export interface CooccurrenceScoreRow {
  numero: number
  score: number
}

export interface EnsembleScoreRow {
  numero: number
  final_score: number
  freq_score: number
  absence_score: number
  recency_score: number
  trend_score: number
  cycle_score: number
  entropy_score: number
  survival_score: number
  markov_score: number
  cooc_score: number
}

// ============================================================================
// RPC Parameter Types
// ============================================================================

export interface GetFrequencyStatsParams {
  p_turno?: string | null
  p_window?: number
  p_game_slug?: string
}

export interface GetEnsembleScoresParams {
  p_turno: string
  p_game_slug?: string
}

export interface GetMarkovTransitionsParams {
  p_turnos?: string[]
  p_order?: number
  p_min_support?: number
  p_game_slug?: string
}

export interface ComputeBacktestParams {
  p_turno: string
  p_game_slug?: string
  p_window?: number
}

export interface VerifyPredictionsParams {}

export interface RunDailyBacktestParams {
  p_game_slug?: string
}
