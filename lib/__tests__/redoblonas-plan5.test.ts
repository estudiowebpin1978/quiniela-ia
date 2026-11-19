import { describe, it, expect } from "vitest"
import { calcularStatsPares } from "@/lib/analisis/redoblonas-plan5"

const drawA = [1005, 2003, 3001, 4013, 5027, 6031, 7044, 8052, 9068, 1073, 2084, 3091, 1212, 3616, 4717, 5521, 6223, 7624, 8825, 9426]
const drawB = [2005, 3017, 4003, 7001, 4113, 5027, 6031, 8013, 9068, 1073, 2084, 3091, 1212, 3616, 4717, 5521, 6223, 7624, 8825, 9426]
const drawC = [1007, 2009, 3001, 4011, 5013, 6027, 7041, 8052, 9060, 1071, 2083, 3091, 1212, 3616, 4717, 5521, 6223, 7624, 8825, 9426]

describe("redoblonas/plan5 — calcularStatsPares", () => {
  it("cuenta frecuencia y distribución exactas de los hechos", () => {
    const stats = calcularStatsPares(
      [
        { numbers: drawA, date: "2026-11-01" },
        { numbers: drawB, date: "2026-11-02" },
        { numbers: drawC, date: "2026-11-03" },
      ],
      [
        [5, 3],
        [5, 27],
        [27, 31],
      ],
    )
    expect(stats.muestra).toBe(3)
    expect(stats.desde).toBe("2026-11-01")
    expect(stats.hasta).toBe("2026-11-03")

    const par = (a: number, b: number) => {
      const [x, y] = a < b ? [a, b] : [b, a]
      return stats.pares.find((p) => p.a === x && p.b === y)
    }
    expect(par(5, 3)!.frecuencia).toBe(2)
    expect(par(5, 27)!.frecuencia).toBe(2)
    expect(par(27, 31)!.frecuencia).toBe(2)
    expect(par(5, 3)!.probConjunta).toBeCloseTo(2 / 3, 6)
    expect(par(5, 3)!.sobreAzar).toBeCloseTo((2 / 3) / ((20 * 19) / (100 * 99)), 5)

    // drawA: 3 completos · drawB: 3 completos · drawC: 0 completos
    expect(stats.distribucion).toEqual([1, 0, 0, 2])
    expect(stats.alMenos1).toBeCloseTo((2 / 3) * 100, 5)
    expect(stats.alMenos3).toBeCloseTo((2 / 3) * 100, 5)
  })

  it("normaliza el par a a<b y etiqueta con dos cifras", () => {
    const stats = calcularStatsPares(
      [{ numbers: [7100, 1300, 4200, 8800, 1600, 2200, 3400, 5400, 6500, 7600, 8700, 9800, 1200, 2300, 4500, 5600, 6600, 7700, 8900, 9900] }],
      [[88, 13]],
    )
    expect(stats.pares[0].label).toBe("13-88")
  })

  it("determinista (misma entrada → misma salida)", () => {
    const rows = [
      { numbers: drawA, date: "2026-11-01" },
      { numbers: drawB, date: "2026-11-02" },
    ]
    expect(calcularStatsPares(rows, [[5, 27]])).toEqual(calcularStatsPares(rows, [[5, 27]]))
  })
})
