/**
 * Infrastructure: Ensemble Repository (Supabase RPC)
 */
import { getSupabaseClient } from "./client"
import type { EnsembleRepository, EnsembleScore } from "@/lib/domain/repositories/ensemble-repository"
import type { EnsembleScoreRow } from "./rpc-types"

export class SupabaseEnsembleRepository implements EnsembleRepository {
  async getScores(turno: string, gameSlug: string = "quiniela"): Promise<EnsembleScore[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb.rpc("get_ensemble_scores", {
      p_turno: turno,
      p_game_slug: gameSlug,
    })

    if (error || !data) return []

    return (data as EnsembleScoreRow[]).map(row => ({
      numero: row.numero,
      final_score: Number(row.final_score),
      freq_score: Number(row.freq_score),
      absence_score: Number(row.absence_score),
      recency_score: Number(row.recency_score),
      trend_score: Number(row.trend_score),
      cycle_score: Number(row.cycle_score),
      entropy_score: Number(row.entropy_score),
      survival_score: Number(row.survival_score),
      markov_score: Number(row.markov_score),
      cooc_score: Number(row.cooc_score),
    }))
  }
}
