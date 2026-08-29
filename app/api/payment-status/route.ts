import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 401 })
  }

  const tier = await resolveUserTier(token)
  if (!tier.userId) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }

  return NextResponse.json({
    // isPremium = acceso pago/admin (NO trial free)
    isPremium: tier.isPremium,
    canAccessPremiumFeatures: tier.canAccessPremiumFeatures,
    isTrialActive: tier.isTrialActive,
    role: tier.role,
    premium_until: tier.premium_until,
    daysRemaining: tier.daysRemaining,
    trialExpired: tier.trialExpired,
    predictionsUsed: tier.predictionsUsed,
    predictionsRemaining: tier.predictionsRemaining,
  })
}
