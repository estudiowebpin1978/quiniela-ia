import { describe, it, expect } from "vitest"
import { computeHeatPenalties, applyHeatPenalty } from "../analisis/heat-penalty"

describe("computeHeatPenalties", () => {
  it("gap = draws desde la aparición MÁS RECIENTe (no la más antigua)", () => {
    // 4661 aparece en el sorteo 0 (más antiguo) Y 8504→04 en sorteo 0 y sorteo 1 (más reciente)
    const map = computeHeatPenalties([
      [4661, 8804, 6095],
      [3687, 8504, 395],
    ])
    expect(map.get(61)!.gap).toBe(1) // solo en sorteo antiguo → gap 1
    expect(map.get(61)!.penalty).toBe(0.9)
    expect(map.get(4)!.gap).toBe(0) // en el sorteo más reciente → gap 0
    expect(map.get(4)!.penalty).toBe(0.82)
    expect(map.get(4)!.label).toBe("muy caliente")
  })

  it("asigna penalidades por tramo de gap", () => {
    // 5 sorteos; número 50 solo en el más viejo → gap 4 (tibio)
    const map = computeHeatPenalties([
      [10, 50],
      [11],
      [12],
      [13],
      [14, 15],
    ])
    expect(map.get(50)!.gap).toBe(4)
    expect(map.get(50)!.penalty).toBe(0.97)
    expect(map.get(15)!.gap).toBe(0)
    expect(map.get(15)!.penalty).toBe(0.82)
    expect(map.get(11)!.gap).toBe(3)
    expect(map.get(11)!.penalty).toBe(0.97)
  })

  it("nunca vuelve 1.10 uniforme: números con aparición reciente reciben <1", () => {
    let draws: number[][] = []
    for (let d = 0; d < 40; d++) {
      const row: number[] = []
      for (let k = 0; k < 18; k++) row.push((d * 7 + k * 3) % 100)
      draws.push(row)
    }
    // Excluir el 0 de las filas recientes → queda atrasado (gap > 20)
    draws = draws.map((r, i) => (i > 15 ? r.filter((n) => n !== 0) : r))
    const map = computeHeatPenalties(draws)
    const penalties = [...map.values()].map((h) => h.penalty)
    expect(penalties.some((p) => p < 1)).toBe(true)
    expect(penalties.some((p) => p > 1)).toBe(true)
    expect(new Set(penalties).size).toBeGreaterThan(1)
    expect(map.get(0)!.gap).toBe(26)
    expect(map.get(0)!.penalty).toBe(1.1)
  })

  it("números nunca vistos usan totalDraws como gap", () => {
    const draws: number[][] = []
    for (let i = 0; i < 25; i++) draws.push([i % 5, (i + 1) % 5])
    const map = computeHeatPenalties(draws)
    expect(map.get(99)!.gap).toBe(25)
    expect(map.get(99)!.penalty).toBe(1.1)
  })

  it("funciona con números de 4 dígitos (mod 100)", () => {
    const map = computeHeatPenalties([[9999, 100], [5555, 101]])
    expect(map.get(99)!.gap).toBe(1)
    expect(map.get(0)!.gap).toBe(1) // 100 % 100 = 0, en el sorteo MÁS VIEJO
    expect(map.get(1)!.gap).toBe(0) // 101 % 100 = 1, en el sorteo más reciente
  })
})

describe("applyHeatPenalty", () => {
  it("multiplica y recorta a [0,1]", () => {
    expect(applyHeatPenalty(0.5, 1.1)).toBeCloseTo(0.55)
    expect(applyHeatPenalty(0.5, 0.82)).toBeCloseTo(0.41)
    expect(applyHeatPenalty(0.95, 1.1)).toBe(1)
  })
})
