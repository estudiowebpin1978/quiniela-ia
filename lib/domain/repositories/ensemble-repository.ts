/**
 * Repository Interface: Ensemble Scores (via RPC)
 */
export interface EnsembleScore {
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

export interface EnsembleRepository {
  getScores(turno: string, gameSlug?: string): Promise<EnsembleScore[]>
}
