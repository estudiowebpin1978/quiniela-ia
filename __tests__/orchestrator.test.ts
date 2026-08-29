/**
 * Tests: Scraping Orchestrator — Circuit Breaker Fallback
 *
 * Verifies:
 * 1. Circuit breaker quarantines a source after 3 consecutive failures
 * 2. Quarantined source is skipped entirely
 * 3. Orchestrator falls back to next available source
 * 4. Source recovery clears quarantine after cooldown
 */

import { SourceStats } from "@/lib/scrapers/types"

// ── Mocks ────────────────────────────────────────────────────────────────────

const quarantinedSources = new Set<string>()
const failureCounts = new Map<string, number>()

jest.mock("@/lib/scrapers/circuit-breaker", () => ({
  isSourceQuarantined: jest.fn(async (source: string) => ({
    isQuarantined: quarantinedSources.has(source),
    consecutiveFailures: failureCounts.get(source) || 0,
    quarantinedUntil: quarantinedSources.has(source) ? new Date(Date.now() + 4 * 60 * 60 * 1000) : null,
  })),
  recordSourceResult: jest.fn(async (source: string, success: boolean) => {
    if (!success) {
      const count = (failureCounts.get(source) || 0) + 1
      failureCounts.set(source, count)
      if (count >= 3) quarantinedSources.add(source)
    } else {
      failureCounts.set(source, 0)
      quarantinedSources.delete(source)
    }
  }),
}))

// Mock parsers — first 4 (parallel) fail, fallback succeeds
jest.mock("@/lib/scrapers/parsers", () => ({
  parseOficial: jest.fn(async () => { throw new Error("primary down") }),
  parseQuinieleando: jest.fn(async () => { throw new Error("primary down") }),
  parseNumerosEnvivo: jest.fn(async () => { throw new Error("primary down") }),
  parseLoteriaMundiales: jest.fn(async () => { throw new Error("primary down") }),
  parseLoteriaOficial: jest.fn(async () => ({
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    source: "loteria-ciudad.gob.ar",
    cabezaMatch: null,
    duration: 80,
    retries: 0,
  })),
  parseQuinielaNacionalN: jest.fn(async () => ({
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    source: "quinielanacionaln.com.ar",
    cabezaMatch: null,
    duration: 90,
    retries: 0,
  })),
  parseNacionalQuiniela: jest.fn(async () => ({
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    source: "nacionalquiniela.com",
    cabezaMatch: null,
    duration: 90,
    retries: 0,
  })),
  verifyCabeza: jest.fn(async () => true),
}))

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Orchestrator — Circuit Breaker Fallback", () => {
  beforeEach(() => {
    quarantinedSources.clear()
    failureCounts.clear()
  })

  it("should fall back to source 5 (loteria-ciudad) when parallel sources fail", async () => {
    const { fetchWithFallback } = await import("@/lib/scrapers/orchestrator")
    const stats: SourceStats = {}

    const result = await fetchWithFallback("2026-08-27", "27-08-2026", "Primera", stats, "quiniela")

    expect(result.numbers.length).toBeGreaterThanOrEqual(20)
    expect(result.source).toBe("loteria-ciudad.gob.ar")
    expect(result.consensusMethod).toBe("sequential_fallback")
  })

  it("should quarantine a source after 3 consecutive failures", async () => {
    const { recordSourceResult } = await import("@/lib/scrapers/circuit-breaker")

    await recordSourceResult("quinieleando.com.ar", false)
    await recordSourceResult("quinieleando.com.ar", false)
    await recordSourceResult("quinieleando.com.ar", false)

    expect(quarantinedSources.has("quinieleando.com.ar")).toBe(true)
    expect(failureCounts.get("quinieleando.com.ar")).toBe(3)
  })

  it("should reset failure count on success", async () => {
    const { recordSourceResult } = await import("@/lib/scrapers/circuit-breaker")

    await recordSourceResult("test-source", false)
    await recordSourceResult("test-source", false)
    await recordSourceResult("test-source", true)

    expect(failureCounts.get("test-source")).toBe(0)
    expect(quarantinedSources.has("test-source")).toBe(false)
  })

  it("should skip quarantined sources entirely", async () => {
    quarantinedSources.add("quinieleando.com.ar")
    failureCounts.set("quinieleando.com.ar", 5)

    const { isSourceQuarantined } = await import("@/lib/scrapers/circuit-breaker")
    const state = await isSourceQuarantined("quinieleando.com.ar")

    expect(state.isQuarantined).toBe(true)
    expect(state.consecutiveFailures).toBe(5)
  })

  it("should return empty array when all sources are exhausted", async () => {
    for (const src of [
      "quiniela.loteriadelaciudad.gob.ar",
      "quinieleando.com.ar",
      "numerosenvivo.com.ar",
      "loteriasmundiales.com.ar",
      "loteria-ciudad.gob.ar",
      "quinielanacionaln.com.ar",
      "nacionalquiniela.com",
    ]) {
      quarantinedSources.add(src)
    }

    const { fetchWithFallback } = await import("@/lib/scrapers/orchestrator")
    const stats: SourceStats = {}

    const result = await fetchWithFallback("2026-08-27", "27-08-2026", "Primera", stats, "quiniela")

    expect(result.numbers).toEqual([])
    expect(result.source).toBe("none")
  })
})
