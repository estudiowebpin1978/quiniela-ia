/**
 * Tests: /api/health — Observability / Dead Man's Switch
 *
 * Verifies:
 * 1. Returns 200 with status "healthy" when DB responds
 * 2. Returns 500 with status "degraded" when DB fails
 * 3. Includes timestamp in response
 * 4. Includes scraper freshness check
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

let dbShouldFail = false
let scraperData: { created_at: string } | null = { created_at: new Date().toISOString() }

jest.mock("@/lib/supabase-client", () => ({
  getSupabaseAdmin: jest.fn(() => ({
    from: jest.fn((table: string) => {
      const chain: Record<string, jest.Mock> = {}

      chain.select = jest.fn().mockReturnValue(chain)
      chain.limit = jest.fn().mockReturnValue(chain)
      chain.order = jest.fn().mockReturnValue(chain)
      chain.single = jest.fn(async () => {
        if (dbShouldFail) throw new Error("connection refused")
        return { data: scraperData, error: null }
      })

      // Make chain thenable for the first query
      chain.then = jest.fn(async (resolve: (v: { data: unknown; error: unknown }) => void) => {
        if (dbShouldFail) {
          resolve({ data: null, error: { message: "connection refused" } })
        } else {
          resolve({ data: [{ id: 1 }], error: null })
        }
      })

      return chain
    }),
  })),
}))

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe("/api/health — Dead Man's Switch", () => {
  beforeEach(() => {
    dbShouldFail = false
    scraperData = { created_at: new Date().toISOString() }
  })

  it("should return HTTP 200 with status healthy when DB is up", async () => {
    const { GET } = await import("@/app/api/health/route")
    const req = new Request("https://quiniela-ia-two.vercel.app/api/health")
    const res = await GET(req as never)

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe("healthy")
    expect(body).toHaveProperty("timestamp")
    expect(body.checks).toHaveProperty("database")
    expect(body.checks.database.ok).toBe(true)
  })

  it("should return HTTP 500 with status degraded when DB is down", async () => {
    dbShouldFail = true

    const { GET } = await import("@/app/api/health/route")
    const req = new Request("https://quiniela-ia-two.vercel.app/api/health")
    const res = await GET(req as never)

    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body.status).toBe("degraded")
    expect(body.checks.database.ok).toBe(false)
  })

  it("should include timestamp in ISO format", async () => {
    const { GET } = await import("@/app/api/health/route")
    const req = new Request("https://quiniela-ia-two.vercel.app/api/health")
    const res = await GET(req as never)

    const body = await res.json()
    const timestamp = new Date(body.timestamp)
    expect(timestamp.getTime()).not.toBeNaN()
  })

  it("should include scraper freshness check", async () => {
    const { GET } = await import("@/app/api/health/route")
    const req = new Request("https://quiniela-ia-two.vercel.app/api/health")
    const res = await GET(req as never)

    const body = await res.json()
    expect(body.checks).toHaveProperty("scraper")
  })
})
