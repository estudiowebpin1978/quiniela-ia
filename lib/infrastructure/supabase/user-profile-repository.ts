/**
 * Infrastructure: User Profile Repository (Supabase)
 */
import { getSupabaseClient } from "./client"
import { UserProfile } from "@/lib/domain/entities/user-profile"
import type { UserProfileRepository } from "@/lib/domain/repositories/user-profile-repository"

export class SupabaseUserProfileRepository implements UserProfileRepository {
  async findById(id: string): Promise<UserProfile | null> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("user_profiles")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !data) return null
    return UserProfile.fromRow(data)
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("user_profiles")
      .select("*")
      .ilike("email", email)
      .single()

    if (error || !data) return null
    return UserProfile.fromRow(data)
  }

  async save(profile: UserProfile): Promise<UserProfile> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from("user_profiles")
      .upsert({
        id: profile.id,
        email: profile.email,
        role: profile.role,
        premium_until: profile.premiumUntil,
        predictions_used: profile.predictionsUsed,
      }, { onConflict: "id" })
      .select()
      .single()

    if (error || !data) throw new Error(`Failed to save profile: ${error?.message}`)
    return UserProfile.fromRow(data)
  }

  async updateRole(id: string, role: "free" | "premium" | "admin"): Promise<void> {
    const sb = getSupabaseClient()
    await sb
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", id)
  }
}
