import { describe, it, expect } from "vitest"
import {
  calcularCoOcurrencias,
  numerosUnicosDosCifras,
} from "@/lib/analisis/redoblonas-coocurrencia"

describe("redoblonas/co-ocurrencia — numerosUnicosDosCifras", () => {
  it("reduce a 2 cifras mod 100 y deduplica", () => {
    expect(numerosUnicosDosCifras([1234, 4234, 8919])).toEqual([19, 34])
  })
  it("maneja valores negativos y grandes sin NaN", () => {
    expect(numerosUnicosDosCifras([-5, 10000, 9999])).toEqual([0, 95, 99])
  })
})

describe("redoblonas/co-ocurrencia — calcularCoOcurrencias", () => {
  const drawA = [1005, 2003, 3001, 4013, 5027, 6031, 7044, 8052, 9068, 1073, 2084, 3091, 1212, 3616, 4717, 5521, 6223, 7624, 8825, 9426]
  const drawB = [1005, 2003, 3001, 1819, 2221, 3922, 4123, 4724, 5925, 6126, 7727, 8328, 1729, 2830, 3331, 5542, 6643, 7244, 8545, 9946]

  it("cuenta pares conjuntos y condicionales sobre hechos reales", () => {
    const r = calcularCoOcurrencias(
      [
        { numbers: drawA, date: "2026-11-01" },
        { numbers: drawB, date: "2026-11-02" },
      ],
      "Previa",
      { topN: 200, minSoporte: 2 },
    )
    expect(r.totalSorteos).toBe(2)
    expect(r.desde).toBe("2026-11-01")
    expect(r.hasta).toBe("2026-11-02")

    // Números comunes a ambos sorteos: 01,03,05,21,23,24,25,26,27,31,44 → C(11,2)=55 pares freq=2
    const freq2 = r.pares.filter((p) => p.frecuencia === 2)
    expect(freq2.length).toBe(55)

    const par = (a: number, b: number) => r.pares.find((p) => p.a === a && p.b === b)
    const p521 = par(5, 21)
    expect(p521).toBeDefined()
    expect(p521!.frecuencia).toBe(2)
    expect(p521!.probConjunta).toBeCloseTo(1, 6)
    expect(p521!.probA_dado_B).toBeCloseTo(1, 6)
    expect(p521!.sobreAzar).toBeCloseTo(1 / ((20 * 19) / (100 * 99)), 3)

    // Un número que sólo está en un sorteo no puede formar pareja freq=2
    expect(par(5, 13)).toBeUndefined()
  })

  it("es determinista (misma entrada → misma salida)", () => {
    const rows = [
      { numbers: drawA, date: "2026-11-01" },
      { numbers: drawB, date: "2026-11-02" },
    ]
    expect(calcularCoOcurrencias(rows, "Previa")).toEqual(
      calcularCoOcurrencias(rows, "Previa"),
    )
  })

  it("devuelve como máximo topN pares", () => {
    const r = calcularCoOcurrencias(
      [
        { numbers: drawA, date: "2026-11-01" },
        { numbers: drawB, date: "2026-11-02" },
      ],
      "Previa",
      { topN: 3, minSoporte: 2 },
    )
    expect(r.pares.length).toBe(3)
  })
})
