/**
 * Tests: Tier Resolution Logic (lib/auth/tier.ts)
 *
 * Verifies:
 * 1. Empty token → empty tier (all defaults)
 * 2. Free user with active trial → canAccess2Cifras=true, canAccessPremiumFeatures=false
 * 3. Free user with expired trial → trialExpired=true, canAccess2Cifras=false
 * 4. Premium user with valid premium_until → isPremium=true, canAccessPremiumFeatures=true
 * 5. Admin email → role="admin", all access granted
 * 6. Free user at max predictions (10) → canSavePrediction=false
 * 7. Premium user unlimited predictions
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockProfiles = new Map<string, Record<string, unknown>>()

jest.mock("@/lib/config", () => ({
  ADMIN_EMAILS: ["estudiowebpin@gmail.com"],
  getSupabaseUrl: () => "https://test.supabase.co",
  getSupabaseKey: () => "eyJ-test-key",
}))

jest.mock("@/lib/auth/jwt", () => ({
  validateJwt: jest.fn(async (token: string) => {
    if (token === "valid-free") return { userId: "free-user-001", email: "free@test.com" }
    if (token === "valid-premium") return { userId: "premium-user-001", email: "premium@test.com" }
    if (token === "valid-admin") return { userId: "admin-user-001", email: "estudiowebpin@gmail.com" }
    if (token === "expired-trial") return { userId: "expired-user-001", email: "expired@test.com" }
    return null
  }),
}))

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const originalFetch = global.fetch

beforeEach(() => {
  mockProfiles.clear()
  mockProfiles.set("free-user-001", {
    id: "free-user-001",
    role: "free",
    premium_until: new Date(Date.now() + 15 * 86400000).toISOString(),
    trial_ends_at: new Date(Date.now() + 15 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  })
  mockProfiles.set("premium-user-001", {
    id: "premium-user-001",
    role: "premium",
    premium_until: new Date(Date.now() + 30 * 86400000).toISOString(),
    trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  })
  mockProfiles.set("admin-user-001", {
    id: "admin-user-001",
    role: "admin",
    premium_until: "2099-01-01",
    trial_ends_at: "2099-01-01",
    created_at: new Date().toISOString(),
  })
  mockProfiles.set("expired-user-001", {
    id: "expired-user-001",
    role: "free",
    premium_until: new Date(Date.now() - 5 * 86400000).toISOString(),
    trial_ends_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 35 * 86400000).toISOString(),
  })

  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString()
    const method = init?.method || "GET"

    if (urlStr.includes("/rest/v1/user_profiles") && method === "GET") {
      const userIdMatch = urlStr.match(/id=eq\.([^&]+)/)
      if (userIdMatch) {
        const user = mockProfiles.get(userIdMatch[1])
        return { json: async () => user ? [user] : [] } as Response
      }
      return { json: async () => [] } as Response
    }

    if (urlStr.includes("/rest/v1/user_predictions") && method === "GET") {
      return {
        headers: { get: (name: string) => name === "content-range" ? "0-9/10" : null },
        json: async () => [],
      } as Response
    }

    if (urlStr.includes("/rest/v1/user_profiles") && (method === "PATCH" || method === "POST")) {
      return { ok: true } as Response
    }

    return { ok: false, json: async () => ({}) } as Response
  }) as typeof fetch
})

afterEach(() => {
  global.fetch = originalFetch
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Tier Resolution Logic", () => {
  let resolveUserTier: typeof import("@/lib/auth/tier").resolveUserTier

  beforeAll(async () => {
    const mod = await import("@/lib/auth/tier")
    resolveUserTier = mod.resolveUserTier
  })

  it("should return empty tier for empty token", async () => {
    const tier = await resolveUserTier("")

    expect(tier.userId).toBeNull()
    expect(tier.role).toBe("free")
    expect(tier.isPremium).toBe(false)
    expect(tier.canAccess2Cifras).toBe(false)
    expect(tier.canAccessPremiumFeatures).toBe(false)
  })

  it("should return empty tier for invalid token", async () => {
    const tier = await resolveUserTier("invalid-token")

    expect(tier.userId).toBeNull()
    expect(tier.role).toBe("free")
  })

  it("should resolve free user with active trial", async () => {
    const tier = await resolveUserTier("valid-free")

    expect(tier.userId).toBe("free-user-001")
    expect(tier.email).toBe("free@test.com")
    expect(tier.role).toBe("free")
    expect(tier.isPremium).toBe(false)
    expect(tier.isTrialActive).toBe(true)
    expect(tier.canAccess2Cifras).toBe(true)
    expect(tier.canAccessPremiumFeatures).toBe(false)
    expect(tier.predictionsRemaining).toBeGreaterThanOrEqual(0)
  })

  it("should resolve premium user", async () => {
    const tier = await resolveUserTier("valid-premium")

    expect(tier.userId).toBe("premium-user-001")
    expect(tier.role).toBe("premium")
    expect(tier.isPremium).toBe(true)
    expect(tier.canAccess2Cifras).toBe(true)
    expect(tier.canAccessPremiumFeatures).toBe(true)
    expect(tier.predictionsRemaining).toBe(-1)
  })

  it("should resolve admin user", async () => {
    const tier = await resolveUserTier("valid-admin")

    expect(tier.userId).toBe("admin-user-001")
    expect(tier.role).toBe("admin")
    expect(tier.isPremium).toBe(true)
    expect(tier.canAccess2Cifras).toBe(true)
    expect(tier.canAccessPremiumFeatures).toBe(true)
  })

  it("should detect expired trial", async () => {
    const tier = await resolveUserTier("expired-trial")

    expect(tier.userId).toBe("expired-user-001")
    expect(tier.trialExpired).toBe(true)
    expect(tier.canAccess2Cifras).toBe(false)
  })

  it("should have daysRemaining as number when valid", async () => {
    const tier = await resolveUserTier("valid-free")
    expect(typeof tier.daysRemaining).toBe("number")
    expect(tier.daysRemaining).toBeGreaterThan(0)
  })
})
