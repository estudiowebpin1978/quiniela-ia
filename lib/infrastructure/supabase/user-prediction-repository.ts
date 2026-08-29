/**
 * Infrastructure: User Prediction Repository (Supabase)
 */
import { getSupabaseClient } from "./client"
import { UserPrediction } from "@/lib/domain/entities/user-prediction"
import type { UserPredictionRepository } from "@/lib/domain/repositories/user-prediction-repository"

export class SupabaseUserPredictionRepository implements UserPredictionRepository {
  async findById(id: string): Promise<UserPrediction | null> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("user_predictions")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !data) return null
    return UserPrediction.fromRow(data)
  }

  async findByUser(userId: string, limit: number = 50, offset: number = 0): Promise<UserPrediction[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("user_predictions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error || !data) return []
    return data.map(UserPrediction.fromRow)
  }

  async countByUser(userId: string): Promise<number> {
    const sb = getSupabaseClient()
    const { count, error } = await sb
      .from("user_predictions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)

    return error ? 0 : (count ?? 0)
  }

  async save(prediction: UserPrediction): Promise<UserPrediction> {
    const sb = getSupabaseClient()
    const payload = prediction.toInsertPayload()

    const { data, error } = await sb
      .from("user_predictions")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single()

    if (error || !data) throw new Error(`Failed to save prediction: ${error?.message}`)
    return UserPrediction.fromRow(data)
  }

  async deleteById(id: string): Promise<boolean> {
    const sb = getSupabaseClient()
    const { error } = await sb
      .from("user_predictions")
      .delete()
      .eq("id", id)

    return !error
  }
}
