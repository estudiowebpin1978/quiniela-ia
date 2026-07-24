/**
 * Infrastructure: Game Repository (Supabase)
 */
import { getSupabaseClient } from "./client"
import { Game } from "@/lib/domain/entities/game"
import type { GameRepository } from "@/lib/domain/repositories/game-repository"

export class SupabaseGameRepository implements GameRepository {
  async findBySlug(slug: string): Promise<Game | null> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("games")
      .select("*")
      .eq("slug", slug)
      .single()

    if (error || !data) return null
    return Game.fromRow(data)
  }

  async findActiveGames(): Promise<Game[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("games")
      .select("*")
      .eq("is_active", true)
      .order("name")

    if (error || !data) return []
    return data.map(Game.fromRow)
  }

  async findAll(): Promise<Game[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("games")
      .select("*")
      .order("name")

    if (error || !data) return []
    return data.map(Game.fromRow)
  }
}
