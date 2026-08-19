import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const tier = await resolveUserTier(token)
  if (!tier.userId) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }

  return NextResponse.json({
    isPremium: tier.isPremium,
    role: tier.role,
    email: tier.email,
    userId: tier.userId,
    premium_until: tier.premium_until,
    daysRemaining: tier.daysRemaining,
    isTrialActive: tier.isTrialActive,
    trialExpired: tier.trialExpired,
    canAccessPremiumFeatures: tier.canAccessPremiumFeatures,
    canAccess2Cifras: tier.canAccess2Cifras,
    canSavePrediction: tier.canSavePrediction,
    predictionsUsed: tier.predictionsUsed,
    predictionsRemaining: tier.predictionsRemaining,
  })
}
