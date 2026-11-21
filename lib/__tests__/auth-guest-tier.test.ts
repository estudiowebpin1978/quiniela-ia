import { describe, expect, it } from "vitest"
import { getGuestTier } from "@/lib/auth/tier"

describe("guest tier", () => {
  it("allows only public two-digit analysis without account capabilities", () => {
    const tier = getGuestTier()

    expect(tier.role).toBe("free")
    expect(tier.canAccess2Cifras).toBe(true)
    expect(tier.canAccessPremiumFeatures).toBe(false)
    expect(tier.canSavePrediction).toBe(false)
    expect(tier.userId).toBeNull()
  })
})
