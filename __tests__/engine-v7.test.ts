/**
 * Tests: Engine V7 — Output Format Validation
 *
 * Verifies:
 * 1. predictV7 returns correct shape: { numero, score, factors }
 * 2. Output is sorted by score descending
 * 3. Top N parameter works (10/5/3)
 * 4. Factors breakdown has all required fields
 * 5. Scores are normalized 0-1
 * 6. Throws on insufficient data
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock("@/lib/analisis/precomputed", () => ({
  loadPrecomputedStats: jest.fn(() => ({
    frequency: {},
    recency: {},
    markov: {},
    cooccurrence: {},
  })),
  getFrequencyScore: jest.fn(() => Math.random() * 10),
  getRecencyScore: jest.fn(() => Math.random() * 10),
  getMarkovScore: jest.fn(() => Math.random() * 10),
  getCooccurrenceScore: jest.fn(() => Math.random() * 10),
}))

// ── Test Data ────────────────────────────────────────────────────────────────

const VALID_DRAWS = Array.from({ length: 30 }, (_, i) => ({
  fecha: `2026-08-${String(i + 1).padStart(2, "0")}`,
  turno: "Primera",
  numbers: Array.from({ length: 25 }, (_, j) => (i * 7 + j * 3 + 13) % 100),
}))

const INSUFFICIENT_DRAWS = VALID_DRAWS.slice(0, 5)

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Engine V7 — Output Format", () => {
  let predictV7: typeof import("@/lib/analisis/engine-v7").predictV7

  beforeAll(async () => {
    const mod = await import("@/lib/analisis/engine-v7")
    predictV7 = mod.predictV7
  })

  it("should return array of { numero, score, factors }", () => {
    const result = predictV7(VALID_DRAWS, "Primera", 10)

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(10)

    for (const item of result) {
      expect(item).toHaveProperty("numero")
      expect(item).toHaveProperty("score")
      expect(item).toHaveProperty("factors")
      expect(typeof item.numero).toBe("string")
      expect(typeof item.score).toBe("number")
    }
  })

  it("should return predictions sorted by score descending", () => {
    const result = predictV7(VALID_DRAWS, "Primera", 10)

    for (let i = 1; i < result.length; i++) {
      expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score)
    }
  })

  it("should respect topN parameter", () => {
    const top10 = predictV7(VALID_DRAWS, "Primera", 10)
    const top5 = predictV7(VALID_DRAWS, "Primera", 5)
    const top3 = predictV7(VALID_DRAWS, "Primera", 3)

    expect(top10.length).toBe(10)
    expect(top5.length).toBe(5)
    expect(top3.length).toBe(3)
  })

  it("should include all factor breakdown fields", () => {
    const result = predictV7(VALID_DRAWS, "Primera", 3)
    const requiredFactors = [
      "survival", "correlation", "spacing", "frequency",
      "recency", "markov", "cycles", "temporal", "debt", "bayesian",
    ]

    for (const item of result) {
      for (const factor of requiredFactors) {
        expect(item.factors).toHaveProperty(factor)
        expect(typeof item.factors[factor as keyof typeof item.factors]).toBe("number")
      }
    }
  })

  it("should produce scores between 0 and 1", () => {
    const result = predictV7(VALID_DRAWS, "Primera", 10)

    for (const item of result) {
      expect(item.score).toBeGreaterThanOrEqual(0)
      expect(item.score).toBeLessThanOrEqual(1)
    }
  })

  it("should throw on insufficient draws (< 10)", () => {
    expect(() => predictV7(INSUFFICIENT_DRAWS, "Primera", 10)).toThrow("Insufficient data")
  })

  it("should throw when turno has < 5 draws", () => {
    const onlyOneTurno = VALID_DRAWS.filter(d => d.turno === "Nocturna")
    expect(() => predictV7(onlyOneTurno, "Nocturna", 10)).toThrow("Insufficient data")
  })

  it("should produce unique numero values in output", () => {
    const result = predictV7(VALID_DRAWS, "Primera", 10)
    const numeros = result.map(r => r.numero)
    const unique = new Set(numeros)
    expect(unique.size).toBe(numeros.length)
  })
})
