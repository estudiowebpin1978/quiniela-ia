/**
 * Domain Entity: UserProfile
 */
export interface UserProfileProps {
  id: string
  email: string
  role: "free" | "premium" | "admin"
  premiumUntil: string | null
  trialEndsAt: string | null
  predictionsUsed: number
}

export class UserProfile {
  private constructor(private props: UserProfileProps) {}

  static create(props: UserProfileProps): UserProfile {
    return new UserProfile(props)
  }

  static fromRow(row: any): UserProfile {
    return UserProfile.create({
      id: row.id,
      email: row.email ?? "",
      role: row.role ?? "free",
      premiumUntil: row.premium_until ?? null,
      trialEndsAt: row.trial_ends_at ?? null,
      predictionsUsed: row.predictions_used ?? 0,
    })
  }

  get id() { return this.props.id }
  get email() { return this.props.email }
  get role() { return this.props.role }
  get predictionsUsed() { return this.props.predictionsUsed }

  get isPremium(): boolean {
    if (this.props.role === "admin") return true
    if (this.props.role === "premium" && this.props.premiumUntil) {
      return new Date(this.props.premiumUntil).getTime() > Date.now()
    }
    return false
  }

  get isTrialActive(): boolean {
    if (this.props.role !== "free") return false
    if (!this.props.premiumUntil) return false
    return new Date(this.props.premiumUntil).getTime() > Date.now()
  }

  get trialExpired(): boolean {
    if (this.props.role !== "free") return false
    if (!this.props.premiumUntil) return false
    return new Date(this.props.premiumUntil).getTime() <= Date.now()
  }
}
