/**
 * Repository Interface: UserProfile
 */
import type { UserProfile } from "../entities/user-profile"

export interface UserProfileRepository {
  findById(id: string): Promise<UserProfile | null>
  findByEmail(email: string): Promise<UserProfile | null>
  save(profile: UserProfile): Promise<UserProfile>
  updateRole(id: string, role: "free" | "premium" | "admin"): Promise<void>
}
