/**
 * Infrastructure: Draw Repository (Supabase)
 */
import { getSupabaseClient } from "./client"
import { Draw } from "@/lib/domain/entities/draw"
import type { DrawRepository } from "@/lib/domain/repositories/draw-repository"

export class SupabaseDrawRepository implements DrawRepository {
  async findRecent(gameId: string, turno: string, limit: number): Promise<Draw[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("draws")
      .select("*")
      .eq("game_id", gameId)
      .ilike("turno", turno)
      .order("date", { ascending: false })
      .limit(limit)

    if (error || !data) return []
    return data.map(Draw.fromRow)
  }

  async findBetweenDates(gameId: string, turno: string, from: string, to: string): Promise<Draw[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("draws")
      .select("*")
      .eq("game_id", gameId)
      .ilike("turno", turno)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })

    if (error || !data) return []
    return data.map(Draw.fromRow)
  }

  async findLatest(gameId: string, turno: string): Promise<Draw | null> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("draws")
      .select("*")
      .eq("game_id", gameId)
      .ilike("turno", turno)
      .order("date", { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null
    return Draw.fromRow(data)
  }

  async upsertMany(draws: Draw[]): Promise<number> {
    const sb = getSupabaseClient()
    const rows = draws.map(d => ({
      game_id: d.gameId,
      date: d.date,
      turno: d.turno,
      numbers: d.numbers,
      source: d.source,
      html_hash: d.htmlHash,
      confidence_score: d.confidenceScore,
      source_priority: d.sourcePriority,
    }))

    const { data, error } = await sb
      .from("draws")
      .upsert(rows, { onConflict: "game_id,date,turno" })
      .select("id")

    if (error) return 0
    return data?.length ?? 0
  }

  async countByGame(gameId: string): Promise<number> {
    const sb = getSupabaseClient()
    const { count, error } = await sb
      .from("draws")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)

    return error ? 0 : (count ?? 0)
  }
}
