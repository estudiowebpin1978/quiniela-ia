/**
 * Application Use Case: GeneratePrediction
 * Orchestrates the full prediction pipeline
 */
import { SupabaseEnsembleRepository } from "@/lib/infrastructure/supabase/ensemble-repository"
import { SupabaseDrawRepository } from "@/lib/infrastructure/supabase/draw-repository"
import { SupabaseGameRepository } from "@/lib/infrastructure/supabase/game-repository"
import { resolveTier, type TierResolution } from "@/lib/domain/services/tier-service"
import { normalizeAndRank, type RankedNumber } from "@/lib/domain/services/score-service"
import { Turno } from "@/lib/domain/value-objects/turno"
import type { PredictionScore } from "@/lib/domain/value-objects/prediction-score"

export interface GeneratePredictionInput {
  turno: string
  targetDate: string
  userToken: string
}

export interface GeneratePredictionOutput {
  ok: boolean
  turno: string
  tier: TierResolution
  scores: RankedNumber[]
  top2c: string[]
  top3c: string[]
  top4c: string[]
  redoblona: string | null
  debug: {
    elapsed_ms: number
    engines: number
    drawsUsed: number
  }
}

export async function generatePrediction(
  input: GeneratePredictionInput,
  resolveTierFn: (token: string) => Promise<TierResolution>,
): Promise<GeneratePredictionOutput> {
  const t0 = Date.now()

  const turno = Turno.create(input.turno)
  const tier = await resolveTierFn(input.userToken)

  const ensembleRepo = new SupabaseEnsembleRepository()
  const drawRepo = new SupabaseDrawRepository()
  const gameRepo = new SupabaseGameRepository()

  const game = await gameRepo.findBySlug("quiniela")
  if (!game) {
    return {
      ok: false,
      turno: turno.name,
      tier,
      scores: [],
      top2c: [],
      top3c: [],
      top4c: [],
      redoblona: null,
      debug: { elapsed_ms: Date.now() - t0, engines: 0, drawsUsed: 0 },
    }
  }

  const draws = await drawRepo.findRecent(game.id, turno.name, 100)
  const ensembleScores = await ensembleRepo.getScores(turno.name, "quiniela")

  // Convert ensemble scores to PredictionScore-like objects
  const scores: PredictionScore[] = ensembleScores.map(es => ({
    num: es.numero,
    score: es.final_score,
    confidence: es.final_score * 0.8,
    padded: String(es.numero).padStart(2, "0"),
    isHot: (threshold: number) => es.final_score >= threshold,
    isCold: (threshold: number) => es.final_score <= threshold,
  })) as unknown as PredictionScore[]

  const ranked = normalizeAndRank(scores)
  const top2c = ranked.slice(0, 10).map(r => r.padded)
  const top3c = tier.canAccessPremiumFeatures
    ? ranked.slice(0, 10).map(r => String(r.numero).padStart(3, "0"))
    : []
  const top4c = tier.canAccessPremiumFeatures
    ? ranked.slice(0, 10).map(r => String(r.numero).padStart(4, "0"))
    : null as unknown as string[]

  let redoblona: string | null = null
  if (tier.canAccessPremiumFeatures && ranked.length >= 2) {
    redoblona = `${ranked[0].padded}-${ranked[1].padded}`
  }

  return {
    ok: true,
    turno: turno.name,
    tier,
    scores: ranked,
    top2c,
    top3c,
    top4c,
    redoblona,
    debug: {
      elapsed_ms: Date.now() - t0,
      engines: 9, // RPC-based ensemble
      drawsUsed: draws.length,
    },
  }
}
