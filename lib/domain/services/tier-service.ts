/**
 * Domain Service: Tier resolution business logic
 */
import { UserProfile } from "../entities/user-profile"

const FREE_TRIAL_DAYS = 30
const FREE_MAX_PREDICTIONS = 10
const ADMIN_EMAILS = ["estudiowebpin@gmail.com"]

export interface TierResolution {
  role: "free" | "premium" | "admin"
  isPremium: boolean
  isTrialActive: boolean
  trialExpired: boolean
  canAccess2Cifras: boolean
  canAccessPremiumFeatures: boolean
  canSavePrediction: boolean
  predictionsUsed: number
  predictionsRemaining: number
  daysRemaining: number | null
}

export function resolveTier(profile: UserProfile | null): TierResolution {
  if (!profile) {
    return {
      role: "free",
      isPremium: false,
      isTrialActive: false,
      trialExpired: false,
      canAccess2Cifras: false,
      canAccessPremiumFeatures: false,
      canSavePrediction: false,
      predictionsUsed: 0,
      predictionsRemaining: FREE_MAX_PREDICTIONS,
      daysRemaining: null,
    }
  }

  const isAdmin = ADMIN_EMAILS.includes(profile.email.toLowerCase())
  const role = isAdmin ? "admin" : profile.role
  const isPremiumRole = role === "admin" || profile.isPremium
  const isTrialActive = profile.isTrialActive
  const trialExpired = profile.trialExpired

  const canAccess2Cifras = isPremiumRole || isTrialActive || trialExpired
  const canAccessPremiumFeatures = isPremiumRole

  const predictionsUsed = profile.predictionsUsed
  const predictionsRemaining = isPremiumRole
    ? Number.POSITIVE_INFINITY
    : trialExpired
      ? FREE_MAX_PREDICTIONS
      : Math.max(0, FREE_MAX_PREDICTIONS - predictionsUsed)

  const canSavePrediction = canAccess2Cifras && (isPremiumRole || predictionsRemaining > 0)

  let daysRemaining: number | null = null
  if (profile.premiumUntil) {
    const until = new Date(profile.premiumUntil)
    daysRemaining = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000))
  }

  return {
    role,
    isPremium: isPremiumRole,
    isTrialActive,
    trialExpired,
    canAccess2Cifras,
    canAccessPremiumFeatures,
    canSavePrediction,
    predictionsUsed,
    predictionsRemaining: isPremiumRole ? -1 : predictionsRemaining,
    daysRemaining,
  }
}
