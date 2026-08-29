/**
 * Infrastructure: Turn Analytics Repository (Supabase)
 */
import { getSupabaseClient } from "./client"
import { TurnAnalytics } from "@/lib/domain/entities/turn-analytics"
import type { TurnAnalyticsRepository } from "@/lib/domain/repositories/turn-analytics-repository"

export class SupabaseTurnAnalyticsRepository implements TurnAnalyticsRepository {
  async findLatest(gameId: string, turno: string): Promise<TurnAnalytics | null> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("turn_analytics")
      .select("*")
      .eq("game_id", gameId)
      .eq("turno", turno)
      .order("fecha", { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null
    return TurnAnalytics.fromRow(data)
  }

  async upsert(analytics: TurnAnalytics): Promise<void> {
    const sb = getSupabaseClient()
    // Uses raw fields since TurnAnalytics doesn't expose toInsertPayload
    // The RPC upsert_turn_analytics handles this
    await sb.rpc("upsert_turn_analytics", {
      p_turno: analytics.turno,
      p_game_slug: "quiniela",
    })
  }

  async computeAll(gameSlug: string = "quiniela"): Promise<void> {
    const sb = getSupabaseClient()
    await sb.rpc("compute_all_turn_analytics", {
      p_game_slug: gameSlug,
    })
  }
}
