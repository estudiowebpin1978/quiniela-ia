import { describe, it, expect } from "vitest"
import { buildPredictionRows, normalizarRedoblonaR } from "../batch-upsert"

const meta = {
  game_id: "game-1",
  date: "2026-10-13",
  turno: "Nocturna",
  engine_version: "v6",
  confidence: 65,
}

describe("normalizarRedoblonaR", () => {
  it("string '07-12' → array ['07-12'] (formato que exige la RPC)", () => {
    expect(normalizarRedoblonaR("07-12")).toEqual(["07-12"])
  })

  it("objeto {cabeza, acompañante} (POST /api/predictions) → array 'CC-AA'", () => {
    expect(normalizarRedoblonaR({ cabeza: "07", acompanante: "12" })).toEqual(["07-12"])
    // con padding a 2 cifras si llega sin cero
    expect(normalizarRedoblonaR({ cabeza: "7", acompanante: "5" })).toEqual(["07-05"])
  })

  it("array ya formado (UI) → se respeta tal cual", () => {
    expect(normalizarRedoblonaR(["07-12"])).toEqual(["07-12"])
    expect(normalizarRedoblonaR(["07-12", "33-44"])).toEqual(["07-12", "33-44"])
  })

  it("vacío / nulo → array vacío (formato seguro para la RPC, nunca null)", () => {
    expect(normalizarRedoblonaR(null)).toEqual([])
    expect(normalizarRedoblonaR(undefined)).toEqual([])
    expect(normalizarRedoblonaR("")).toEqual([])
    expect(normalizarRedoblonaR("   ")).toEqual([])
    expect(normalizarRedoblonaR([])).toEqual([])
    expect(normalizarRedoblonaR({})).toEqual([])
  })

  it("el resultado es SIEMPRE array — nunca scalar, objeto ni null", () => {
    const entradas = ["07-12", { cabeza: "07", acompanante: "12" }, ["07-12"], null, "", [], {}]
    for (const e of entradas) {
      expect(Array.isArray(normalizarRedoblonaR(e))).toBe(true)
    }
  })
})

describe("buildPredictionRows (formato 'r' en user_predictions.numeros)", () => {
  const premium = [{ user_id: "u1", role: "premium" }]
  const free = [{ user_id: "u2", role: "free" }]

  it("premium con redoblona string → 'r' guardado como ARRAY", () => {
    const rows = buildPredictionRows(
      premium,
      { numeros_2: ["07", "12"], numeros_3: ["007"], numeros_4: ["0007"], redoblona: "07-12" },
      meta,
    )
    const stored = JSON.parse(rows[0].numeros[0])
    expect(Array.isArray(stored.r)).toBe(true)
    expect(stored.r).toEqual(["07-12"])
  })

  it("premium con redoblona objeto → 'r' como array 'CC-AA'", () => {
    const rows = buildPredictionRows(
      premium,
      {
        numeros_2: ["07", "12"],
        numeros_3: ["007"],
        numeros_4: [],
        redoblona: { cabeza: "7", acompanante: "12" },
      },
      meta,
    )
    const stored = JSON.parse(rows[0].numeros[0])
    expect(stored.r).toEqual(["07-12"])
  })

  it("sin redoblona → 'r' como array vacío (antes null; '[]' es seguro para la RPC)", () => {
    const rows = buildPredictionRows(
      premium,
      { numeros_2: ["07"], numeros_3: ["007"], numeros_4: [] },
      meta,
    )
    const stored = JSON.parse(rows[0].numeros[0])
    expect(stored.r).toEqual([])
  })

  it("free → numeros plano (sin JSON, sin 'r')", () => {
    const rows = buildPredictionRows(free, { numeros_2: ["07", "12"] }, meta)
    expect(rows[0].numeros).toEqual(["07", "12"])
  })
})
