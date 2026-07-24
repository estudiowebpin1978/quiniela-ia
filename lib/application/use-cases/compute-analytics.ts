/**
 * Application Use Case: ComputeTurnAnalytics
 * Pre-calculates statistical analytics for all turnos
 */
import { getSupabaseClient } from "@/lib/infrastructure/supabase/client"

export interface ComputeAnalyticsOutput {
  ok: boolean
  turnos: number
  errors: string[]
}

export async function computeTurnAnalytics(
  gameSlug: string = "quiniela",
): Promise<ComputeAnalyticsOutput> {
  const sb = getSupabaseClient()
  const errors: string[] = []

  try {
    // Get distinct turnos for this game
    const { data: draws, error: drawError } = await sb
      .from("draws")
      .select("turno")
      .eq("game_id", `(SELECT id FROM games WHERE slug = '${gameSlug}')`)
      .order("turno")

    if (drawError) {
      return { ok: false, turnos: 0, errors: [drawError.message] }
    }

    const turnos = [...new Set((draws ?? []).map((d: any) => d.turno))]

    for (const turno of turnos) {
      try {
        // Upsert analytics via RPC
        await sb.rpc("upsert_turn_analytics", {
          p_turno: turno,
          p_game_slug: gameSlug,
        })
      } catch (err: any) {
        errors.push(`Analytics failed for ${turno}: ${err.message}`)
      }
    }

    return { ok: errors.length === 0, turnos: turnos.length, errors }
  } catch (err: any) {
    return { ok: false, turnos: 0, errors: [err.message || "Analytics computation failed"] }
  }
}
